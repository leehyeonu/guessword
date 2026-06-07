import hashlib
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()

# slowapi 제한자(Limiter) 인스턴스화
# 앱 수준에서 처리 속도 및 제한을 처리하도록 main.py에 등록됩니다.
limiter = Limiter(key_func=get_remote_address)

# API 스키마
class GuessRequest(BaseModel):
    guess_word: str = Field(..., description="유저가 입력한 단어")

class GuessResponse(BaseModel):
    guess_word: str
    similarity: float = Field(..., description="-1과 1 사이의 코사인 유사도")
    score: float = Field(..., description="0과 100 사이의 보정된 비선형 점수")
    is_correct: bool = Field(..., description="정답 단어와 일치하는지 여부")
    target_word: str = Field(..., description="정답 단어 (일치할 때만 실제 단어 제공, 평소에는 빈 문자열)")
    game_id: str = Field(..., description="현재 정답 단어의 해시값 기반 고유 게임 ID")

class GameInfoResponse(BaseModel):
    game_id: str = Field(..., description="현재 진행 중인 정답 단어의 해시값 기반 고유 게임 ID")

class ValidateTargetRequest(BaseModel):
    target_word: str = Field(..., description="FastText 어휘 사전에서 확인할 단어")

class ValidateTargetResponse(BaseModel):
    target_word: str
    valid: bool = Field(..., description="단어가 사전에 존재하면 True, 그렇지 않으면 False")


def get_game_id(target_word: str) -> str:
    """정답 단어의 SHA-256 해시를 고유 game_id로 사용합니다."""
    hasher = hashlib.sha256()
    hasher.update(target_word.encode("utf-8"))
    return hasher.hexdigest()


@router.get("/game_info", response_model=GameInfoResponse)
def get_game_info(request: Request):
    """
    현재 진행 중인 게임 세션의 고유 game_id(정답 해시)를 반환합니다.
    """
    target = getattr(request.app.state, "target_word", "사과")
    if not target:
        target = "사과"
        request.app.state.target_word = target
    
    return GameInfoResponse(game_id=get_game_id(target))


@router.post("/guess", response_model=GuessResponse)
@limiter.limit("2/second")
def guess(request: Request, body: GuessRequest):
    """
    추측 단어를 제출하여 코사인 유사도와 비선형 보정 점수를 받습니다.
    백엔드 메모리에 은닉된 정답 단어와 비교합니다.
    """
    # 서버 시작 시 로드된 NLP 래퍼 가져오기
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="서버에 FastText 모델이 아직 초기화되지 않았습니다."
        )

    # 메모리에 저장된 정답 단어 가져오기 (없으면 기본값 사과)
    target = getattr(request.app.state, "target_word", "사과")
    if not target:
        target = "사과"
        request.app.state.target_word = target

    guess = body.guess_word.strip()

    if not guess:
        raise HTTPException(
            status_code=400,
            detail="입력 단어는 비어 있을 수 없습니다."
        )

    # 어휘 사전 검증 (OOV 체크)
    if not nlp_wrapper.is_word_in_vocab(target) or not nlp_wrapper.is_word_in_vocab(guess):
        raise HTTPException(
            status_code=400,
            detail="사전에 없는 단어입니다."
        )

    similarity, score = nlp_wrapper.calculate_score(target, guess)
    is_correct = (target == guess)
    game_id = get_game_id(target)

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
    """
    특정 정답 단어가 FastText 어휘 사전에 존재하는지 검증합니다.
    """
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="서버에 FastText 모델이 아직 초기화되지 않았습니다."
        )

    target = body.target_word.strip()
    if not target:
        return ValidateTargetResponse(target_word=target, valid=False)

    is_valid = nlp_wrapper.is_word_in_vocab(target)

    return ValidateTargetResponse(
        target_word=target,
        valid=is_valid
    )

