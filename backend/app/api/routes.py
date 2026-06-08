import hashlib
import os
import unicodedata
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()

# SlowAPI Limiter 인스턴스 (IP 기준)
limiter = Limiter(key_func=get_remote_address)

# API 입출력 모델 스키마
class GuessRequest(BaseModel):
    guess_word: str = Field(..., description="사용자가 입력한 추측 단어")
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

class ValidateTargetRequest(BaseModel):
    target_word: str = Field(..., description="어휘 사전에 존재하는지 확인할 단어")

class ValidateTargetResponse(BaseModel):
    target_word: str
    valid: bool = Field(..., description="사전에 있으면 True, 없으면 False")

class ClearItem(BaseModel):
    id: str
    gameId: str
    attempts: int
    timestamp: str
    nickname: str

class AttemptItem(BaseModel):
    id: str
    nickname: str
    score: float
    timestamp: str

class GameStatsResponse(BaseModel):
    global_best_score: float
    recent_clears: list[ClearItem]
    recent_attempts: list[AttemptItem]


def get_game_id(target_word: str) -> str:
    """정답 단어의 해시값(SHA-256)을 구합니다."""
    hasher = hashlib.sha256()
    salt = os.getenv("GAME_ID_SALT", "").strip()
    if salt:
        hasher.update(salt.encode("utf-8"))
        hasher.update(b":")
    hasher.update(target_word.encode("utf-8"))
    return hasher.hexdigest()


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
    """현재 세션의 고유 game_id(정답 해시) 조회"""
    target = getattr(request.app.state, "target_word", "사과")
    if not target:
        target = "사과"
        request.app.state.target_word = target
    
    return GameInfoResponse(game_id=get_game_id(target))


@router.get("/game_stats", response_model=GameStatsResponse)
def get_game_stats(request: Request, game_id: str | None = None, limit: int = 5):
    """공개 UI에 필요한 최소 통계만 백엔드 API를 통해 조회"""
    target = getattr(request.app.state, "target_word", "사과") or "사과"
    current_game_id = game_id or get_game_id(target)
    store = getattr(request.app.state, "firestore_store", None)

    if store is None:
        return GameStatsResponse(global_best_score=0, recent_clears=[], recent_attempts=[])

    return GameStatsResponse(
        global_best_score=store.get_global_best_score(current_game_id),
        recent_clears=store.get_recent_clears(limit),
        recent_attempts=store.get_recent_attempts(10),
    )


@router.post("/guess", response_model=GuessResponse)
@limiter.limit("2/second")
def guess(request: Request, body: GuessRequest):
    """단어 추측 및 유사도 점수 반환"""
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="서버에 FastText 모델이 아직 로드되지 않았습니다."
        )

    target = getattr(request.app.state, "target_word", "사과")
    if not target:
        target = "사과"
        request.app.state.target_word = target

    # 자모 분리 방지를 위한 NFC 정규화
    guess = unicodedata.normalize('NFC', body.guess_word.strip())

    if not guess:
        raise HTTPException(
            status_code=400,
            detail="입력 단어는 비어 있을 수 없습니다."
        )

    # OOV (Out of Vocab) 체크
    if not nlp_wrapper.is_word_in_vocab(target) or not nlp_wrapper.is_word_in_vocab(guess):
        raise HTTPException(
            status_code=400,
            detail="사전에 없는 단어입니다."
        )

    similarity, score = nlp_wrapper.calculate_score(target, guess)
    is_correct = (target == guess)
    game_id = get_game_id(target)
    client_ip, user_agent = get_client_metadata(request)

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
        )

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
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="서버에 FastText 모델이 아직 로드되지 않았습니다."
        )

    target = unicodedata.normalize('NFC', body.target_word.strip())
    if not target:
        return ValidateTargetResponse(target_word=target, valid=False)

    is_valid = nlp_wrapper.is_word_in_vocab(target)

    return ValidateTargetResponse(
        target_word=target,
        valid=is_valid
    )
