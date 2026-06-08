import hashlib
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

class GuessResponse(BaseModel):
    guess_word: str
    similarity: float = Field(..., description="코사인 유사도 (-1 ~ 1)")
    score: float = Field(..., description="보정된 점수 (0 ~ 100)")
    is_correct: bool = Field(..., description="정답 여부")
    target_word: str = Field(..., description="정답 단어 (맞췄을 때만 채워지고 평소엔 빈값)")
    game_id: str = Field(..., description="현재 정답의 SHA-256 해시값")
    client_ip: str = Field(..., description="요청한 클라이언트 IP")
    user_agent: str = Field(..., description="요청한 클라이언트 User-Agent")

class GameInfoResponse(BaseModel):
    game_id: str = Field(..., description="현재 정답의 SHA-256 해시값")

class ValidateTargetRequest(BaseModel):
    target_word: str = Field(..., description="어휘 사전에 존재하는지 확인할 단어")

class ValidateTargetResponse(BaseModel):
    target_word: str
    valid: bool = Field(..., description="사전에 있으면 True, 없으면 False")


def get_game_id(target_word: str) -> str:
    """정답 단어의 해시값(SHA-256)을 구합니다."""
    hasher = hashlib.sha256()
    hasher.update(target_word.encode("utf-8"))
    return hasher.hexdigest()


@router.get("/game_info", response_model=GameInfoResponse)
def get_game_info(request: Request):
    """현재 세션의 고유 game_id(정답 해시) 조회"""
    target = getattr(request.app.state, "target_word", "사과")
    if not target:
        target = "사과"
        request.app.state.target_word = target
    
    return GameInfoResponse(game_id=get_game_id(target))


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

    # IP 및 User-Agent 추출
    x_forwarded_for = request.headers.get("x-forwarded-for")
    x_real_ip = request.headers.get("x-real-ip")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    elif x_real_ip:
        client_ip = x_real_ip.strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    user_agent = request.headers.get("user-agent", "unknown")

    return GuessResponse(
        guess_word=guess,
        similarity=similarity,
        score=score,
        is_correct=is_correct,
        target_word=target if is_correct else "",
        game_id=game_id,
        client_ip=client_ip,
        user_agent=user_agent
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
