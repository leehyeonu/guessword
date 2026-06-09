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

_leaderboard_cache = {}
CACHE_TTL = 60  # 60초 캐싱

def invalidate_leaderboard_cache():
    """마이그레이션이나 점수 등록 후 캐시를 비워서 즉시 반영되도록 합니다."""
    _leaderboard_cache.clear()

class ScoreRequest(BaseModel):
    game_id: str = Field(..., description="정답 단어의 해시값 (Game ID)")
    attempts: int = Field(..., description="맞추기까지 걸린 시도 횟수")
    nickname: str = Field("", description="익명 유저의 닉네임 (토큰 없을 때 사용)")

@router.post("/score")
def save_score(request: ScoreRequest, token: str = None):
    logger.info(f"📥 [LEADERBOARD] 점수 등록 요청 수신 (game_id={request.game_id}, attempts={request.attempts}, nickname='{request.nickname}', token={'있음' if token else '없음'})")
    # 토큰이 있으면 인증된 닉네임 사용, 실패 시 body의 닉네임으로 fallback
    nickname = None
    if token:
        try:
            nickname = verify_token(token)
        except HTTPException as e:
            logger.warning(f"⚠️ [LEADERBOARD] 토큰 검증 실패 ({e.detail}), body nickname으로 fallback")
    
    if not nickname:
        if request.nickname and request.nickname.strip():
            nickname = request.nickname.strip()[:20]
        else:
            logger.warning("⚠️ [LEADERBOARD] 토큰도 닉네임도 없어서 거부")
            raise HTTPException(status_code=400, detail="토큰 또는 닉네임이 필요합니다.")
    
    logger.info(f"👤 [LEADERBOARD] 닉네임 결정: '{nickname}'")
    
    db = FirestoreStore().client
    if not db:
        logger.error("❌ [LEADERBOARD] Firestore 클라이언트 없음")
        raise HTTPException(status_code=500, detail="Database not available")
        
    kst = timezone(timedelta(hours=9))
    now_str = datetime.now(kst).isoformat()
    
    # 1. 서버 사이드 시도 횟수 검증 (어뷰징 방지)
    actual_attempts = request.attempts
    try:
        attempts_query = db.collection("attempts").where(filter=firestore.FieldFilter("gameId", "==", request.game_id)).where(filter=firestore.FieldFilter("nickname", "==", nickname))
        count_result = attempts_query.count().get()
        if count_result and count_result[0][0].value > 0:
            actual_attempts = count_result[0][0].value
            logger.info(f"🔍 [LEADERBOARD] 서버 검증 시도 횟수: {actual_attempts}회")
    except Exception as e:
        logger.warning(f"⚠️ [LEADERBOARD] 시도 횟수 검증 실패 (fallback 사용): {e}")
    
    # 2. 일일 기록 확인 및 저장
    daily_ref = db.collection("daily_scores").document(request.game_id).collection("scores").document(nickname)
    user_ref = db.collection("users").document(nickname)
    
    @firestore.transactional
    def save_and_update_score(transaction, d_ref, u_ref):
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
def get_daily_leaderboard(game_id: str | None = None, limit: int = 10):
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")
        
    cache_key = f"recent_clears_{limit}"
    now = time.time()
    if cache_key in _leaderboard_cache:
        cached_data = _leaderboard_cache[cache_key]
        if now - cached_data["timestamp"] < 30:  # 30초 캐싱
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
def get_overall_leaderboard():
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")
        
    cache_key = "overall"
    now = time.time()
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
