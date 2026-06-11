import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
import bcrypt
from google.cloud import firestore
from app.services.firestore_store import FirestoreStore
import logging

router = APIRouter()
logger = logging.getLogger("malmatch.auth")

# ==========================================
# JWT 인증 및 보안 설정
# ==========================================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
if not SECRET_KEY:
    # 프로덕션 환경에서 환경변수 누락으로 인한 취약점 노출을 차단하기 위한 하드 가드
    logger.critical("🚨 [CRITICAL SECURITY ERROR] JWT_SECRET_KEY 환경 변수가 설정되지 않았습니다. 안전을 위해 기본 키 사용을 차단하고 기동을 거부합니다.")
    raise RuntimeError("JWT_SECRET_KEY environment variable is mandatory for production.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


# ==========================================
# Pydantic 요청/응답 스키마 정의 (DTO)
# ==========================================
class SignUpRequest(BaseModel):
    # 닉네임은 최소 2자, 최대 20자로 제한하여 악의적인 페이로드 주입 방지
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
    """
    KST(한국 표준시) 기준으로 30일 만료 기간을 가진 JWT Access Token을 생성합니다.
    """
    to_encode = data.copy()
    kst = timezone(timedelta(hours=9))
    expire = datetime.now(kst) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> str:
    """
    전달받은 JWT 토큰의 서명을 검증하고 디코딩하여 주체(subject)인 닉네임을 추출합니다.
    서명이 손상되었거나 만료된 경우 401 Unauthorized 에러를 발생시킵니다.
    """
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

def _extract_bearer(header_value: str) -> str | None:
    """
    'Bearer <token>' 형식의 헤더 값에서 토큰 부분만 추출합니다.
    형식이 맞지 않으면 None을 반환합니다.
    """
    if not header_value:
        return None
    parts = header_value.split(" ")
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None

def _extract_user_token(request: Request) -> str:
    """
    요청에서 사용자 JWT 토큰을 추출합니다.
    Next.js 프록시가 HF Spaces 게이트웨이 인증을 위해 Authorization 헤더를 덮어쓰는 구조이므로,
    프록시가 원본 JWT를 보존해 둔 X-User-Auth 헤더를 최우선으로 검사합니다.
    조회 순서: X-User-Auth → Authorization → query param(deprecated)
    """
    # 1순위: 프록시가 보존해둔 원본 JWT (X-User-Auth 커스텀 헤더)
    token = _extract_bearer(request.headers.get("x-user-auth", ""))
    if token:
        return token

    # 2순위: 직접 호출 시의 표준 Authorization 헤더 (로컬 개발 환경 등)
    token = _extract_bearer(request.headers.get("authorization", ""))
    if token:
        return token

    # 3순위: 레거시 query parameter (deprecated, 보안 경고 로깅)
    token = request.query_params.get("token")
    if token:
        logger.warning("⚠️ [SECURITY WARNING] Query parameter 'token' is deprecated. Use Authorization header instead.")
        return token

    raise HTTPException(status_code=401, detail="인증 토큰이 누락되었습니다.")

@router.post("/signup", response_model=AuthResponse)
def signup(request: Request, body: SignUpRequest):
    """
    회원 가입 API. 
    닉네임 중복 여부를 점검하고, 비밀번호를 bcrypt 단방향 솔팅 해싱하여 Firestore에 안전하게 저장합니다.
    """
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="데이터베이스 서버에 연결할 수 없습니다.")
    db = store.client
        
    # 닉네임 중복 검증 (Firestore 도큐먼트 ID 기반의 Point Query로 O(1) 조회 성능 보장)
    doc_ref = db.collection("users").document(body.nickname)
    doc = doc_ref.get()
    if doc.exists:
        raise HTTPException(status_code=400, detail="이미 존재하는 닉네임입니다.")
        
    # 안전한 단방향 bcrypt 솔트 기반 해싱 처리
    hashed_password = bcrypt.hashpw(body.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    kst = timezone(timedelta(hours=9))
    now_str = datetime.now(kst).isoformat()
    
    # 신규 유저 도큐먼트 초기 상태 설정 및 쓰기 실행
    doc_ref.set({
        "nickname": body.nickname,
        "password_hash": hashed_password,
        "total_wins": 0,
        "total_attempts_played": 0,
        "created_at": now_str
    })
    
    access_token = create_access_token(data={"sub": body.nickname})
    logger.info(f"🔐 [AUTH] 새로운 사용자 가입 완료: '{body.nickname}'")
    return {"token": access_token, "nickname": body.nickname}

@router.post("/login", response_model=AuthResponse)
def login(request: Request, body: LoginRequest):
    """
    로그인 API.
    닉네임 존재 여부를 확인하고 bcrypt 해시 판독을 통해 인증에 성공하면 새로운 JWT Access Token을 발급합니다.
    """
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="데이터베이스 서버에 연결할 수 없습니다.")
    db = store.client
        
    # 유저 도큐먼트 조회
    doc_ref = db.collection("users").document(body.nickname)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    user_data = doc.to_dict()
    user_hash = user_data.get("password_hash", "")
    if not user_hash:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    # bcrypt.checkpw로 입력된 평문 비밀번호와 저장된 해시 비교 검증
    try:
        is_correct = bcrypt.checkpw(body.password.encode('utf-8'), user_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"❌ [AUTH] 비밀번호 검증 중 예외 발생: {e}")
        is_correct = False
        
    if not is_correct:
        raise HTTPException(status_code=401, detail="닉네임 또는 비밀번호가 올바르지 않습니다.")
        
    access_token = create_access_token(data={"sub": body.nickname})
    logger.info(f"🔐 [AUTH] 사용자 로그인 성공: '{body.nickname}'")
    return {"token": access_token, "nickname": body.nickname}

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
def migrate_data(request: Request, body: MigrateRequest):
    token = _extract_user_token(request)
    nickname = verify_token(token)
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="데이터베이스 서버에 연결할 수 없습니다.")
    db = store.client
    
    total_renamed = 0
    anon_nick = body.anon_nickname.strip()
    
    # 1. 익명 닉네임이 있으면 Firestore의 모든 관련 컬렉션에서 닉네임 변경
    if anon_nick and anon_nick != nickname:
        logger.info(f"🔄 [MIGRATE] 익명 기록 마이그레이션 시작: '{anon_nick}' → '{nickname}'")
        for collection in ["attempts", "clears", "closest_guesses"]:
            total_renamed += _rename_nickname_in_collection(db, collection, anon_nick, nickname)
        
        # daily_scores는 하위 컬렉션 구조이므로 전체 stream() 대신 참여했던 특정 gameId만 먼저 추출하여 Point query 처리
        try:
            from google.cloud.firestore_v1.base_query import FieldFilter
            participated_game_ids = set()
            
            # attempts 컬렉션에서 해당 익명 유저가 참여했던 고유 gameId 추출
            attempts_snap = db.collection("attempts").where(
                filter=FieldFilter("nickname", "==", anon_nick)
            ).stream()
            for doc in attempts_snap:
                g_id = doc.to_dict().get("gameId")
                if g_id:
                    participated_game_ids.add(g_id)
            
            # clears 컬렉션에서도 gameId 병합 (혹시 모를 누락 방지)
            clears_snap = db.collection("clears").where(
                filter=FieldFilter("nickname", "==", anon_nick)
            ).stream()
            for doc in clears_snap:
                g_id = doc.to_dict().get("gameId")
                if g_id:
                    participated_game_ids.add(g_id)
            
            # 수집된 특정 gameId에 대해서만 리더보드 레코드 마이그레이션 처리 (N+1 근절)
            for game_id in participated_game_ids:
                score_ref = db.collection("daily_scores").document(game_id).collection("scores").document(anon_nick)
                score_snap = score_ref.get()
                if score_snap.exists:
                    score_data = score_snap.to_dict()
                    score_data["nickname"] = nickname
                    new_score_ref = db.collection("daily_scores").document(game_id).collection("scores").document(nickname)
                    new_snap = new_score_ref.get()
                    if not new_snap.exists:
                        new_score_ref.set(score_data)
                        score_ref.delete()
                        total_renamed += 1
                        logger.info(f"🔄 [MIGRATE] daily_scores/{game_id}/scores 닉네임 변경 완료 ({anon_nick} → {nickname})")
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
    added_wins = len(body.past_sessions)
    added_attempts = sum(session.get("attemptsCount", 0) for session in body.past_sessions)
    
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


@router.post("/withdraw")
def withdraw_account(request: Request):
    """
    회원 탈퇴 처리.
    users 테이블의 회원 문서는 물리적으로 삭제(Hard Delete)하고,
    attempts, clears, closest_guesses, daily_scores(하위 scores) 컬렉션의 기록들은
    리더보드 및 통계 유지를 위해 nickname 필드를 "탈퇴한 사용자"로 익명화 치환(Anonymize)합니다.
    """
    token = _extract_user_token(request)
    try:
        nickname = verify_token(token)
    except HTTPException as e:
        logger.warning(f"⚠️ [WITHDRAWAL] 토큰 검증 실패로 탈퇴 요청 거부 ({e.detail})")
        raise
        
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="데이터베이스 서버에 연결할 수 없습니다.")
    db = store.client
    
    logger.info(f"🗑️ [WITHDRAWAL] '{nickname}' 사용자의 회원 탈퇴 및 게임 데이터 익명화 시작")
    
    # 1. attempts 익명화 ("탈퇴한 사용자"로 nickname 일괄 업데이트)
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter
        attempts_ref = db.collection("attempts").where(filter=FieldFilter("nickname", "==", nickname))
        batch = db.batch()
        count = 0
        for doc in attempts_ref.stream():
            batch.update(doc.reference, {"nickname": "탈퇴한 사용자"})
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        if count > 0:
            batch.commit()
        logger.info(f"🗑️ [WITHDRAWAL] attempts 데이터 익명화 완료")
    except Exception as e:
        logger.error(f"❌ [WITHDRAWAL] attempts 데이터 익명화 중 오류: {e}")

    # 2. clears 익명화
    try:
        clears_ref = db.collection("clears").where(filter=FieldFilter("nickname", "==", nickname))
        batch = db.batch()
        count = 0
        for doc in clears_ref.stream():
            batch.update(doc.reference, {"nickname": "탈퇴한 사용자"})
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        if count > 0:
            batch.commit()
        logger.info(f"🗑️ [WITHDRAWAL] clears 데이터 익명화 완료")
    except Exception as e:
        logger.error(f"❌ [WITHDRAWAL] clears 데이터 익명화 중 오류: {e}")

    # 3. closest_guesses 익명화
    try:
        closest_ref = db.collection("closest_guesses").where(filter=FieldFilter("nickname", "==", nickname))
        batch = db.batch()
        count = 0
        for doc in closest_ref.stream():
            batch.update(doc.reference, {"nickname": "탈퇴한 사용자"})
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        if count > 0:
            batch.commit()
        logger.info(f"🗑️ [WITHDRAWAL] closest_guesses 데이터 익명화 완료")
    except Exception as e:
        logger.error(f"❌ [WITHDRAWAL] closest_guesses 데이터 익명화 중 오류: {e}")

    # 4. daily_scores (하위 scores 컬렉션) 익명화 - Collection Group query 활용
    try:
        scores_ref = db.collection_group("scores").where(filter=FieldFilter("nickname", "==", nickname))
        batch = db.batch()
        count = 0
        for doc in scores_ref.stream():
            batch.update(doc.reference, {"nickname": "탈퇴한 사용자"})
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        if count > 0:
            batch.commit()
        logger.info(f"🗑️ [WITHDRAWAL] daily_scores 내 scores 익명화 완료")
    except Exception as e:
        logger.error(f"❌ [WITHDRAWAL] daily_scores 익명화 중 오류: {e}")

    # 5. users 테이블에서 사용자 프로필 문서 물리 삭제 (Hard Delete)
    try:
        db.collection("users").document(nickname).delete()
        logger.info(f"🗑️ [WITHDRAWAL] users 문서 물리 삭제 완료. 최종 탈퇴 처리: '{nickname}'")
    except Exception as e:
        logger.error(f"❌ [WITHDRAWAL] users 문서 삭제 중 오류: {e}")
        raise HTTPException(status_code=500, detail="회원 정보 삭제 중 오류가 발생했습니다.")
        
    # 리더보드 캐시 무효화
    try:
        from app.api.leaderboard import invalidate_leaderboard_cache
        invalidate_leaderboard_cache()
    except Exception as e:
        logger.warning(f"⚠️ [WITHDRAWAL] 리더보드 캐시 무효화 실패: {e}")
        
    return {"success": True, "message": "회원 탈퇴 및 데이터 익명화가 안전하게 완료되었습니다."}

