import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import bcrypt
from google.cloud import firestore
from app.services.firestore_store import FirestoreStore
import logging

router = APIRouter()
logger = logging.getLogger("guessword.auth")

# JWT Config
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "guessword_super_secret_key_123!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30



class SignUpRequest(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=20)
    password: str = Field(..., min_length=4)

class LoginRequest(BaseModel):
    nickname: str = Field(...)
    password: str = Field(...)

class MigrateRequest(BaseModel):
    past_sessions: list

class AuthResponse(BaseModel):
    token: str
    nickname: str

def create_access_token(data: dict):
    to_encode = data.copy()
    kst = timezone(timedelta(hours=9))
    expire = datetime.now(kst) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        nickname: str = payload.get("sub")
        if nickname is None:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
        return nickname
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="인증 토큰이 만료되었습니다.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

@router.post("/signup", response_model=AuthResponse)
def signup(request: SignUpRequest):
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="데이터베이스 서버에 연결할 수 없습니다.")
        
    doc_ref = db.collection("users").document(request.nickname)
    doc = doc_ref.get()
    if doc.exists:
        raise HTTPException(status_code=400, detail="이미 존재하는 닉네임입니다.")
        
    hashed_password = bcrypt.hashpw(request.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    kst = timezone(timedelta(hours=9))
    now_str = datetime.now(kst).isoformat()
    
    doc_ref.set({
        "nickname": request.nickname,
        "password_hash": hashed_password,
        "total_wins": 0,
        "total_attempts_played": 0,
        "created_at": now_str
    })
    
    access_token = create_access_token(data={"sub": request.nickname})
    logger.info(f"🔐 [AUTH] 새로운 사용자 가입 완료: '{request.nickname}'")
    return {"token": access_token, "nickname": request.nickname}

@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest):
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="데이터베이스 서버에 연결할 수 없습니다.")
        
    doc_ref = db.collection("users").document(request.nickname)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    user_data = doc.to_dict()
    user_hash = user_data.get("password_hash", "")
    if not user_hash:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    try:
        is_correct = bcrypt.checkpw(request.password.encode('utf-8'), user_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"❌ [AUTH] 비밀번호 검증 중 예외 발생: {e}")
        is_correct = False
        
    if not is_correct:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    access_token = create_access_token(data={"sub": request.nickname})
    logger.info(f"🔐 [AUTH] 사용자 로그인 성공: '{request.nickname}'")
    return {"token": access_token, "nickname": request.nickname}

@router.post("/migrate")
def migrate_data(request: MigrateRequest, token: str):
    nickname = verify_token(token)
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="데이터베이스 서버에 연결할 수 없습니다.")
        
    # past_sessions 배열 길이를 total_wins에 더합니다.
    # 각 세션에서 시도했던 횟수를 total_attempts_played에 더합니다.
    added_wins = len(request.past_sessions)
    added_attempts = sum(session.get("attemptsCount", 0) for session in request.past_sessions)
    
    doc_ref = db.collection("users").document(nickname)
    
    @firestore.transactional
    def update_user_stats(transaction, ref):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            return
            
        current_data = snapshot.to_dict()
        if current_data.get("migrated"):
            raise ValueError("Already migrated")
            
        new_wins = current_data.get("total_wins", 0) + added_wins
        new_attempts = current_data.get("total_attempts_played", 0) + added_attempts
        
        transaction.update(ref, {
            "total_wins": new_wins,
            "total_attempts_played": new_attempts,
            "migrated": True
        })
        
    try:
        update_user_stats(db.transaction(), doc_ref)
        logger.info(f"🔄 [AUTH] 오프라인 기록 연동 성공: '{nickname}' (추가된 승리 수: {added_wins})")
        return {"success": True, "migrated_wins": added_wins}
    except ValueError as ve:
        if str(ve) == "Already migrated":
            raise HTTPException(status_code=400, detail="이미 오프라인 기록 연동을 완료한 계정입니다.")
        raise HTTPException(status_code=500, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
