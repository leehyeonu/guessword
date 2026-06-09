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
logger = logging.getLogger("malmatch.auth")

# JWT Config
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "malmatch_super_secret_key_123!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30



class SignUpRequest(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=20)
    password: str = Field(..., min_length=4)

class LoginRequest(BaseModel):
    nickname: str = Field(...)
    password: str = Field(...)

class MigrateRequest(BaseModel):
    past_sessions: list = []
    anon_nickname: str = Field("", description="이전 익명 닉네임 (예: 익명#O8RQ)")

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

def _rename_nickname_in_collection(db, collection_name: str, old_nickname: str, new_nickname: str) -> int:
    """컬렉션 내의 문서들에서 nickname 필드를 변경합니다."""
    from google.cloud.firestore_v1.base_query import FieldFilter
    count = 0
    try:
        query = db.collection(collection_name).where(
            filter=FieldFilter("nickname", "==", old_nickname)
        )
        docs = query.stream()
        batch = db.batch()
        batch_count = 0
        for doc in docs:
            batch.update(doc.reference, {"nickname": new_nickname})
            count += 1
            batch_count += 1
            # Firestore batch는 최대 500개씩
            if batch_count >= 400:
                batch.commit()
                batch = db.batch()
                batch_count = 0
        if batch_count > 0:
            batch.commit()
        if count > 0:
            logger.info(f"🔄 [MIGRATE] '{collection_name}' 컬렉션에서 {count}개 문서 닉네임 변경 완료 ({old_nickname} → {new_nickname})")
    except Exception as e:
        logger.warning(f"⚠️ [MIGRATE] '{collection_name}' 닉네임 변경 중 오류: {e}")
    return count

@router.post("/migrate")
def migrate_data(request: MigrateRequest, token: str):
    nickname = verify_token(token)
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="데이터베이스 서버에 연결할 수 없습니다.")
    
    total_renamed = 0
    anon_nick = request.anon_nickname.strip()
    
    # 1. 익명 닉네임이 있으면 Firestore의 모든 관련 컬렉션에서 닉네임 변경
    if anon_nick and anon_nick != nickname:
        logger.info(f"🔄 [MIGRATE] 익명 기록 마이그레이션 시작: '{anon_nick}' → '{nickname}'")
        for collection in ["attempts", "clears", "closest_guesses"]:
            total_renamed += _rename_nickname_in_collection(db, collection, anon_nick, nickname)
        
        # daily_scores는 하위 컬렉션 구조이므로 별도 처리
        # daily_scores/{game_id}/scores/{nickname} 형태
        try:
            daily_docs = db.collection("daily_scores").stream()
            for game_doc in daily_docs:
                score_ref = game_doc.reference.collection("scores").document(anon_nick)
                score_snap = score_ref.get()
                if score_snap.exists:
                    score_data = score_snap.to_dict()
                    score_data["nickname"] = nickname
                    # 새 닉네임으로 문서 생성
                    new_score_ref = game_doc.reference.collection("scores").document(nickname)
                    new_snap = new_score_ref.get()
                    if not new_snap.exists:
                        new_score_ref.set(score_data)
                        score_ref.delete()
                        total_renamed += 1
                        logger.info(f"🔄 [MIGRATE] daily_scores/{game_doc.id}/scores 닉네임 변경 완료")
                    else:
                        # 이미 해당 닉네임으로 기록이 있으면 익명 기록만 삭제
                        score_ref.delete()
        except Exception as e:
            logger.warning(f"⚠️ [MIGRATE] daily_scores 닉네임 변경 중 오류: {e}")
        
        # 익명 users 문서 삭제 (log_guess에서 merge로 만들어진 것)
        try:
            anon_user_ref = db.collection("users").document(anon_nick)
            anon_snap = anon_user_ref.get()
            if anon_snap.exists:
                anon_data = anon_snap.to_dict()
                # password_hash가 없는 문서만 삭제 (진짜 익명 유저)
                if not anon_data.get("password_hash"):
                    anon_user_ref.delete()
                    logger.info(f"🗑️ [MIGRATE] 익명 유저 문서 삭제: '{anon_nick}'")
        except Exception as e:
            logger.warning(f"⚠️ [MIGRATE] 익명 유저 문서 삭제 중 오류: {e}")
    
    # 2. past_sessions 통계 합산 (기존 로직)
    added_wins = len(request.past_sessions)
    added_attempts = sum(session.get("attemptsCount", 0) for session in request.past_sessions)
    
    doc_ref = db.collection("users").document(nickname)
    
    if added_wins > 0:
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
        except ValueError as ve:
            if str(ve) != "Already migrated":
                raise HTTPException(status_code=500, detail=str(ve))
        except Exception as e:
            logger.warning(f"⚠️ [MIGRATE] 통계 합산 중 오류: {e}")
    # 마이그레이션 완료 후 리더보드 캐시 무효화
    if total_renamed > 0 or added_wins > 0:
        try:
            from app.api.leaderboard import invalidate_leaderboard_cache
            invalidate_leaderboard_cache()
            logger.info("🔄 [MIGRATE] 리더보드 캐시 무효화 완료")
        except Exception as e:
            logger.warning(f"⚠️ [MIGRATE] 리더보드 캐시 무효화 실패: {e}")
    
    return {"success": True, "migrated_wins": added_wins, "renamed_records": total_renamed}

