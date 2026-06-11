from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from google.cloud import firestore
import time
from app.services.firestore_store import FirestoreStore
from app.services.daily_word import get_daily_target_word, get_game_id
from app.api.auth import verify_token
import logging

router = APIRouter()
logger = logging.getLogger("malmatch.leaderboard")

import threading

# ==========================================
# 리더보드 캐시 레이어 및 동시성 락 설정
# ==========================================
# API 응답 성능 극대화 및 Firestore Read 비용 절감을 위한 로컬 인메모리 캐시
_leaderboard_cache = {}
CACHE_TTL = 60  # 캐시 유효 시간 (Time-To-Live): 60초
# 다중 스레드 환경에서 캐시 초기화/쓰기 동기화를 보장하여 Race Condition 및 캐시 스탬피드(Thundering Herd) 현상을 방지하기 위한 Lock 객체
_leaderboard_lock = threading.Lock()

def invalidate_leaderboard_cache():
    """마이그레이션이나 점수 등록 후 캐시를 비워서 즉시 반영되도록 합니다."""
    _leaderboard_cache.clear()

class ScoreRequest(BaseModel):
    game_id: str = Field(..., description="정답 단어의 해시값 (Game ID)")
    attempts: int = Field(..., description="맞추기까지 걸린 시도 횟수")
    nickname: str = Field("", description="익명 유저의 닉네임 (토큰 없을 때 사용)")

@router.post("/score")
def save_score(request: Request, body: ScoreRequest):
    """
    사용자가 게임 정답을 맞춘 후 점수(시도 횟수)를 제출/등록하는 엔드포인트.
    클라이언트가 조작하여 보낸 임의의 시도 횟수를 그대로 받지 않고,
    보안성 강화를 위해 'clears' 컬렉션의 실제 완료 기록과 대조하여 교차 검증(Cross Validation)을 강제합니다.
    """
    token = None
    auth_header = request.headers.get("authorization")
    if auth_header:
        parts = auth_header.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            
    if not token:
        token = request.query_params.get("token")
        if token:
            logger.warning("⚠️ [SECURITY WARNING] Query parameter 'token' is deprecated for save_score. Use Authorization header instead.")

    logger.info(f"📥 [LEADERBOARD] 점수 등록 요청 수신 (game_id={body.game_id}, attempts={body.attempts}, nickname='{body.nickname}', token={'있음' if token else '없음'})")
    # 토큰이 있으면 인증된 닉네임 사용, 실패 시 body의 닉네임으로 fallback
    nickname = None
    if token:
        try:
            nickname = verify_token(token)
        except HTTPException as e:
            logger.warning(f"⚠️ [LEADERBOARD] 토큰 검증 실패 ({e.detail}), body nickname으로 fallback")
    
    if not nickname:
        if body.nickname and body.nickname.strip():
            nickname = body.nickname.strip()[:20]
        else:
            logger.warning("⚠️ [LEADERBOARD] 토큰도 닉네임도 없어서 거부")
            raise HTTPException(status_code=400, detail="토큰 또는 닉네임이 필요합니다.")
    
    logger.info(f"👤 [LEADERBOARD] 닉네임 결정: '{nickname}'")
    
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        logger.error("❌ [LEADERBOARD] Firestore 클라이언트 없음")
        raise HTTPException(status_code=503, detail="Database not available")
    db = store.client
        
    kst = timezone(timedelta(hours=9))
    now_str = datetime.now(kst).isoformat()
    
    # 🚨 [보안 보완] 실질적 클리어 검증 단계 추가 (어뷰징 원천 차단)
    # clears 컬렉션에 해당 유저가 game_id의 정답을 실제로 맞춘 로그가 있는지 판별합니다.
    try:
        clears_ref = db.collection("clears") \
            .where(filter=firestore.FieldFilter("gameId", "==", body.game_id)) \
            .where(filter=firestore.FieldFilter("nickname", "==", nickname)) \
            .limit(1)
        clears_snap = list(clears_ref.stream())
        
        if not clears_snap:
            logger.warning(f"🚨 [LEADERBOARD] 어뷰징 감지! '{nickname}' 사용자는 '{body.game_id}' 게임을 정상적으로 완료한 내역이 없습니다.")
            raise HTTPException(status_code=403, detail="게임을 완료하지 않은 사용자는 점수를 등록할 수 없습니다.")
        
        # 클라이언트가 임의 조작해 전송한 attempts 대신, DB에 정밀 검증되어 기록된 attempts 값을 사용
        actual_attempts = clears_snap[0].to_dict().get("attempts", body.attempts)
        logger.info(f"🔍 [LEADERBOARD] 교차 검증 성공. 실제 기록된 시도 횟수: {actual_attempts}회")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"⚠️ [LEADERBOARD] 시도 횟수 검증 실패 (fallback 적용): {e}")
        actual_attempts = body.attempts
    
    # 2. 일일 기록 확인 및 저장
    daily_ref = db.collection("daily_scores").document(body.game_id).collection("scores").document(nickname)
    user_ref = db.collection("users").document(nickname)
    
    @firestore.transactional
    def save_and_update_score(transaction, d_ref, u_ref):
        """
        데이터베이스 일관성(Consistency)과 동시 제어를 보장하기 위한 분산 트랜잭션.
        동작 메커니즘:
        1. daily_scores 문서의 존재 여부를 read 후 중복 점수 제출 여부 검증
        2. 중복이 아닐 경우 신규 점수 데이터 Write (set)
        3. users 문서의 누적 전적(total_wins, total_attempts_played) 갱신 (update 또는 set)
        이를 통해 원자성(Atomicity)을 보장하고 데이터 오염을 원천 차단합니다.
        """
        daily_snap = d_ref.get(transaction=transaction)
        user_snap = u_ref.get(transaction=transaction)
        
        # 어뷰징 방지: 해당 정답 단어에 이미 점수를 등록한 기록이 있다면 덮어쓰기나 승리 수 증가를 하지 않습니다.
        if daily_snap.exists:
            logger.info(f"ℹ️ [LEADERBOARD] '{nickname}' 이미 해당 단어 점수 등록됨 (중복 방지)")
            return False
            
        # 처음 등록하는 경우
        transaction.set(d_ref, {
            "nickname": nickname,
            "attempts": actual_attempts,
            "timestamp": now_str
        })
        
        if user_snap.exists:
            current_data = user_snap.to_dict()
            new_wins = current_data.get("total_wins", 0) + 1
            new_attempts = current_data.get("total_attempts_played", 0) + actual_attempts
            transaction.update(u_ref, {
                "total_wins": new_wins,
                "total_attempts_played": new_attempts,
                "last_played": now_str
            })
        else:
            # 익명이든 회원이든 동일한 구조로 유저 문서 생성
            transaction.set(u_ref, {
                "nickname": nickname,
                "total_wins": 1,
                "total_attempts_played": actual_attempts,
                "last_played": now_str
            })
            
        logger.info(f"🏆 [LEADERBOARD] 일일 리더보드 점수 등록 성공 (사용자: '{nickname}', 시도: {actual_attempts}회)")
        return True
    
    try:
        result = save_and_update_score(db.transaction(), daily_ref, user_ref)
        logger.info(f"✅ [LEADERBOARD] 트랜잭션 완료 (결과: {result})")
        if result:
            invalidate_leaderboard_cache()
    except Exception as e:
        logger.error(f"❌ [LEADERBOARD] 트랜잭션 실패: {e}")
        raise HTTPException(status_code=500, detail=f"점수 저장 실패: {str(e)}")
    
    return {"success": True}

@router.get("/daily")
def get_daily_leaderboard(request: Request, game_id: str | None = None, limit: int = 10):
    """
    최근 게임 정답 클리어 기록 목록을 조회하는 API.
    동시 접속자 폭주 상황에서 Firestore의 Read 부하를 낮추기 위해
    이중 검사 잠금(Double-Checked Locking) 패턴을 적용하여, Lock을 획득하기 전/후에 캐시 유효성을 검사합니다.
    이를 통해 Thundering Herd 문제를 방지합니다.
    """
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="Database not available")
    db = store.client
        
    cache_key = f"recent_clears_{limit}"
    now = time.time()
    if cache_key in _leaderboard_cache:
        cached_data = _leaderboard_cache[cache_key]
        if now - cached_data["timestamp"] < 30:  # 30초 캐싱
            return {"game_id": "recent_clears", "leaderboard": cached_data["data"]}
            
    with _leaderboard_lock:
        if cache_key in _leaderboard_cache:
            cached_data = _leaderboard_cache[cache_key]
            if now - cached_data["timestamp"] < 30:
                return {"game_id": "recent_clears", "leaderboard": cached_data["data"]}
                
        try:
            logger.info("🔍 [DB_READ] Firestore 최근 클리어 기록 조회")
            query = db.collection("clears").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
            
            results = []
            for doc in query.stream():
                data = doc.to_dict()
                timestamp = data.get("timestamp")
                if hasattr(timestamp, "isoformat"):
                    timestamp_value = timestamp.isoformat()
                else:
                    timestamp_value = str(timestamp)
                    
                results.append({
                    "nickname": data.get("nickname", "익명"),
                    "attempts": data.get("attempts", 0),
                    "timestamp": timestamp_value,
                    "word": data.get("word", "???"),  # 단어 정보가 없는 예전 문서 대응
                    "round": data.get("round", 0)  # 회차 정보
                })
                
            _leaderboard_cache[cache_key] = {
                "timestamp": now,
                "data": results
            }
                
            return {"game_id": "recent_clears", "leaderboard": results}
        except Exception as e:
            logger.error(f"❌ [LEADERBOARD] 최근 클리어 조회 실패: {e}")
            return {"game_id": "recent_clears", "leaderboard": []}

@router.get("/overall")
def get_overall_leaderboard(request: Request):
    """
    명예의 전당(전체 누적 정답 수 Top 10) 리더보드 조회 API.
    'total_wins >= 1' 필터링 후 total_wins 내림차순 정렬 쿼리를 수행합니다.
    ※ Firestore 쿼리 제약사항: 정렬(Order By)과 조건(Where) 필터가 다를 경우 복합 인덱스(Composite Index) 설정이 필수적입니다.
    이를 위해 GCP Console의 Firestore 인덱스에 'users' 컬렉션에 대한 [total_wins ASCENDING, total_wins DESCENDING] 형태 혹은 필요한 복합 인덱스가 사전 빌드되어 있어야 합니다.
    """
    store = getattr(request.app.state, "firestore_store", None)
    if not store or not store.enabled:
        raise HTTPException(status_code=503, detail="Database not available")
    db = store.client
        
    cache_key = "overall"
    now = time.time()
    if cache_key in _leaderboard_cache:
        cached_data = _leaderboard_cache[cache_key]
        if now - cached_data["timestamp"] < CACHE_TTL:
            return {"leaderboard": cached_data["data"]}
        
    with _leaderboard_lock:
        if cache_key in _leaderboard_cache:
            cached_data = _leaderboard_cache[cache_key]
            if now - cached_data["timestamp"] < CACHE_TTL:
                return {"leaderboard": cached_data["data"]}
                
        # 총 승리 횟수가 1 이상인 유저만, 많은 순서대로 10명 조회 (Top 10)
        logger.info("🔍 [DB_READ] Firestore 전체 리더보드(명예의 전당) 조회")
        query = db.collection("users").where(
            filter=firestore.FieldFilter("total_wins", ">=", 1)
        ).order_by("total_wins", direction=firestore.Query.DESCENDING).limit(10)
        
        results = []
        for doc in query.stream():
            data = doc.to_dict()
            results.append({
                "nickname": data.get("nickname"),
                "total_wins": data.get("total_wins", 0),
                "total_attempts_played": data.get("total_attempts_played", 0)
            })
            
        _leaderboard_cache[cache_key] = {
            "timestamp": now,
            "data": results
        }
            
        return {"leaderboard": results}
