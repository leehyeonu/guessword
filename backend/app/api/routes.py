from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()

# Instantiate slowapi Limiter
# It will be registered in main.py to handle rates and limits at the app level
limiter = Limiter(key_func=get_remote_address)

# API Schemas
class GuessRequest(BaseModel):
    target_word: str = Field(..., description="The correct answer to compare against")
    guess_word: str = Field(..., description="The word submitted by the user")

class GuessResponse(BaseModel):
    target_word: str
    guess_word: str
    similarity: float = Field(..., description="Cosine similarity between -1 and 1")
    score: float = Field(..., description="Calibrated, non-linear score between 0 and 100")

class ValidateTargetRequest(BaseModel):
    target_word: str = Field(..., description="The word to check in FastText vocabulary")

class ValidateTargetResponse(BaseModel):
    target_word: str
    valid: bool = Field(..., description="True if the word is in vocabulary, False otherwise")


@router.post("/guess", response_model=GuessResponse)
@limiter.limit("2/second")
def guess(request: Request, body: GuessRequest):
    """
    Submits a guess word and receives the cosine similarity and non-linear calibrated score.
    Returns 400 if target_word or guess_word is not present in the model's vocabulary.
    """
    # Retrieve NLP wrapper loaded at server startup
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="The FastText model is not initialized yet on the server."
        )

    target = body.target_word.strip()
    guess = body.guess_word.strip()

    if not target or not guess:
        raise HTTPException(
            status_code=400,
            detail="입력 단어는 비어 있을 수 없습니다."
        )

    # Validate vocabulary (OOV Check)
    if not nlp_wrapper.is_word_in_vocab(target) or not nlp_wrapper.is_word_in_vocab(guess):
        raise HTTPException(
            status_code=400,
            detail="사전에 없는 단어입니다."
        )

    similarity, score = nlp_wrapper.calculate_score(target, guess)

    return GuessResponse(
        target_word=target,
        guess_word=guess,
        similarity=similarity,
        score=score
    )


@router.post("/validate_target", response_model=ValidateTargetResponse)
def validate_target(request: Request, body: ValidateTargetRequest):
    """
    Validates if a specific target word exists in the FastText vocabulary.
    """
    nlp_wrapper = getattr(request.app.state, "nlp_wrapper", None)
    if nlp_wrapper is None:
        raise HTTPException(
            status_code=500,
            detail="The FastText model is not initialized yet on the server."
        )

    target = body.target_word.strip()
    if not target:
        return ValidateTargetResponse(target_word=target, valid=False)

    is_valid = nlp_wrapper.is_word_in_vocab(target)

    return ValidateTargetResponse(
        target_word=target,
        valid=is_valid
    )
