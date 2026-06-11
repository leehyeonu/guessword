import hashlib
import os
import unicodedata
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.daily_word import get_daily_target_word, get_past_answers, get_game_id, rotate_target_word, get_daily_target_round, get_past_rounds

router = APIRouter()
logger = logging.getLogger("malmatch.api")

# SlowAPI Rate Limiter 인스턴스 설정 (클라이언트 IP 기준 트래픽 제한)
# 동시성 요청 폭주 및 무차별 전송(Brute-Force) 방어를 위한 초당 요청률 하드 가이드
limiter = Limiter(key_func=get_remote_address)

# ==========================================
# API 입출력 모델 및 데이터 검증(Validation) 스키마
# ==========================================
class GuessRequest(BaseModel):
    # 비정상적인 페이로드 또는 버퍼 오버플로우 방지를 위해 최대 길이 30자 필터링 제약 추가
    guess_word: str = Field(..., description="사용자가 입력한 추측 단어", max_length=30)
    nickname: str = Field("익명", description="사용자 표시 닉네임", max_length=20)
    attempt_count: int = Field(1, description="현재 게임에서의 누적 시도 횟수", ge=1)

class GuessResponse(BaseModel):
    guess_word: str
    similarity: float = Field(..., description="코사인 유사도 (-1 ~ 1)")
    score: float = Field(..., description="보정된 점수 (0 ~ 100)")
    is_correct: bool = Field(..., description="정답 여부")
    target_word: str = Field(..., description="정답 단어 (맞췄을 때만 채워지고 평소엔 빈값)")
    game_id: str = Field(..., description="현재 정답의 SHA-256 해시값")

class GameInfoResponse(BaseModel):
    game_id: str = Field(..., description="현재 정답의 SHA-256 해시값")
    round: int = Field(1, description="현재 정답의 회차")
    past_answers: dict = Field(default={}, description="이전 정답 단어 맵")
    past_rounds: dict = Field(default={}, description="이전 정답 회차 맵")

class ValidateTargetRequest(BaseModel):
    target_word: str = Field(..., description="어휘 사전에 존재하는지 확인할 단어", max_length=30)

class ValidateTargetResponse(BaseModel):
    target_word: str
    valid: bool = Field(..., description="사전에 있으면 True, 없으면 False")

class AttemptItem(BaseModel):
    id: str
    nickname: str
    score: float
    timestamp: str

class GameStatsResponse(BaseModel):
    global_best_score: float
    recent_attempts: list[AttemptItem]



def get_client_metadata(request: Request) -> tuple[str, str]:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    x_real_ip = request.headers.get("x-real-ip")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    elif x_real_ip:
        client_ip = x_real_ip.strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    user_agent = request.headers.get("user-agent", "unknown")
    return client_ip, user_agent


@router.get("/game_info", response_model=GameInfoResponse)
def get_game_info(request: Request):
    """현재 세션의 고유 game_id(정답 해시)와 이전 정답 목록 조회"""
    target = get_daily_target_word()
    
    # game_id는 정답 단어의 해시값입니다.
    hashed_game_id = get_game_id(target)
    
    # 현재 회차를 가져옵니다.
    round_val = get_daily_target_round()
    
    # 이전 세션들의 정답들과 회차들을 가져옵니다.
    past_answers = get_past_answers()
    past_rounds = get_past_rounds()
    
    return {
        "game_id": hashed_game_id,
        "round": round_val,
        "past_answers": past_answers,
        "past_rounds": past_rounds
    }


import time

# 간단한 인-메모리 TTL 캐시 (60초 만료)
_game_stats_cache = {}

@router.get("/game_stats", response_model=GameStatsResponse)
def get_game_stats(request: Request, game_id: str | None = None, limit: int = 5):
    """공개 UI에 필요한 최소 통계만 백엔드 API를 통해 조회"""
    target = get_daily_target_word()
    current_game_id = game_id or get_game_id(target)

    # 캐시 확인 (game_id와 limit 기준)
    cache_key = f"{current_game_id}_{limit}"
    now = time.time()

    if cache_key in _game_stats_cache:
        cached_item = _game_stats_cache[cache_key]
        if now - cached_item["timestamp"] < 30:  # 30초 캐싱
            return cached_item["data"]

    store = getattr(request.app.state, "firestore_store", None)
    if store is None:
        return GameStatsResponse(global_best_score=0, recent_attempts=[])

    response_data = GameStatsResponse(
        global_best_score=store.get_global_best_score(current_game_id),
        recent_attempts=store.get_recent_attempts(10),
    )

    # 캐시에 저장
    _game_stats_cache[cache_key] = {
        "timestamp": now,
        "data": response_data
    }

    return response_data


@router.post("/guess", response_model=GuessResponse)
@limiter.limit("2/second")  # IP당 초당 최대 2회로 제한하여 매크로/Brute-Force 차단
def guess(request: Request, body: GuessRequest):
    """
    단어 추측 및 코사인 유사도 분석 엔드포인트.
    FastText 모델을 활용해 정답 단어와 사용자 입력 단어 간의 벡터 유사도 점수(0~100점 보정값)를 연산하여 반환합니다.
    """
    # 이중 방어막: Pydantic 필터링에 덧붙여 수동 길이 예외 핸들링 적용
    if len(body.guess_word) > 30:
        raise HTTPException(
            status_code=400,
            detail="추측 단어는 최대 30자 이하로 입력해주세요."
        )

    # FastText 모델 비동기 로딩 과정 중 요청 발생 시 데이터 레이스 회피용 백그라운드 가드
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper == "LOADING":
        raise HTTPException(
            status_code=503,
            detail="서버가 구동 중이며 AI 모델을 메모리에 불러오는 중입니다. 잠시 후(약 1~2분) 다시 시도해 주세요."
        )
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=503,
            detail="서버에 FastText 모델이 로드되지 않았습니다. 잠시 후 다시 시도해 주세요."
        )

    # 활성화된 정답 단어 널 포인터 체크 방어 코드
    target = get_daily_target_word()
    if not target:
        raise HTTPException(
            status_code=503,
            detail="현재 활성화된 정답 단어를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요."
        )
    round_val = get_daily_target_round()

    # 입력 폼에서 한글 자음/모음이 깨지거나 분리되는 현상을 교정하기 위해 NFC 정규화 적용
    guess = unicodedata.normalize('NFC', body.guess_word.strip())

    if not guess:
        raise HTTPException(
            status_code=400,
            detail="입력 단어는 비어 있을 수 없습니다."
        )

    # OOV (Out of Vocab, 미등록 단어) 예외 처리 가드
    # 사전에 아예 존재하지 않는 어휘의 유사도 요청을 거부하여 벡터 비정상 상태(NaN) 연산 가능성 원천 차단
    if not nlp_wrapper.is_word_in_vocab(target) or not nlp_wrapper.is_word_in_vocab(guess):
        raise HTTPException(
            status_code=400,
            detail="사전에 없는 단어입니다."
        )

    similarity, score = nlp_wrapper.calculate_score(target, guess)
    is_correct = (target == guess)
    game_id = get_game_id(target)
    client_ip, user_agent = get_client_metadata(request)

    logger.info(f"👤 [USER_GUESS] '{body.nickname}' 사용자가 '{guess}' 단어를 시도했습니다. (유사도: {similarity:.4f}, 점수: {score:.1f})")
    if is_correct:
        logger.info(f"🎉 [CORRECT_GUESS] '{body.nickname}' 사용자가 정답 '{target}'을(를) 맞췄습니다! (총 시도: {body.attempt_count}회)")

    store = getattr(request.app.state, "firestore_store", None)
    if store is not None:
        store.log_guess(
            game_id=game_id,
            nickname=body.nickname,
            word=guess,
            similarity=similarity,
            score=score,
            is_correct=is_correct,
            attempt_count=body.attempt_count,
            ip=client_ip,
            device=user_agent,
            round_val=round_val,
        )

    if is_correct:
        rotate_target_word(target)

        # 캐시 무효화 로직 삭제 (Firestore 읽기 비용 절감을 위해 30초 자연 TTL 에 의존)

    return GuessResponse(
        guess_word=guess,
        similarity=similarity,
        score=score,
        is_correct=is_correct,
        target_word=target if is_correct else "",
        game_id=game_id
    )


@router.post("/validate_target", response_model=ValidateTargetResponse)
def validate_target(request: Request, body: ValidateTargetRequest):
    """특정 단어가 FastText 사전에 등록되어 있는지 체크"""
    if len(body.target_word) > 30:
        raise HTTPException(
            status_code=400,
            detail="확인할 단어는 최대 30자 이하로 입력해주세요."
        )

    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=503,
            detail="서버에 FastText 모델이 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요."
        )

    target = unicodedata.normalize('NFC', body.target_word.strip())
    if not target:
        return ValidateTargetResponse(target_word=target, valid=False)

    is_valid = nlp_wrapper.is_word_in_vocab(target)

    return ValidateTargetResponse(
        target_word=target,
        valid=is_valid
    )
