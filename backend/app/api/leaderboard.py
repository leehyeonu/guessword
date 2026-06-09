from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from google.cloud import firestore
import time
from app.services.firestore_store import FirestoreStore
from app.services.daily_word import get_daily_target_word
from app.api.auth import verify_token

router = APIRouter()

_leaderboard_cache = {}
CACHE_TTL = 60  # 60초 캐싱

class ScoreRequest(BaseModel):
    game_id: str = Field(..., description="오늘 날짜 (예: 2026-06-09)")
    attempts: int = Field(..., description="맞추기까지 걸린 시도 횟수")

@router.post("/score")
def save_score(request: ScoreRequest, token: str):
    nickname = verify_token(token)
    db = FirestoreStore().client
    if not db:
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
    except Exception:
        pass  # 조회 실패 시 클라이언트에서 보낸 값을 Fallback으로 사용
    
    # 2. 일일 기록 확인 및 저장
    daily_ref = db.collection("daily_scores").document(request.game_id).collection("scores").document(nickname)
    user_ref = db.collection("users").document(nickname)
    
    @firestore.transactional
    def save_and_update_score(transaction, d_ref, u_ref):
        daily_snap = d_ref.get(transaction=transaction)
        user_snap = u_ref.get(transaction=transaction)
        
        # 어뷰징 방지: 오늘 이미 점수를 등록한 기록이 있다면 덮어쓰기나 승리 수 증가를 하지 않습니다.
        if daily_snap.exists:
            return False
            
        # 오늘 처음 등록하는 경우
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
        return True

    save_and_update_score(db.transaction(), daily_ref, user_ref)
    return {"success": True}

@router.get("/daily")
def get_daily_leaderboard(game_id: str = None):
    db = FirestoreStore().client
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")
        
    if not game_id:
        kst = timezone(timedelta(hours=9))
        game_id = datetime.now(kst).strftime("%Y-%m-%d")
        
    cache_key = f"daily_{game_id}"
    now = time.time()
    if cache_key in _leaderboard_cache:
        cached_data = _leaderboard_cache[cache_key]
        if now - cached_data["timestamp"] < CACHE_TTL:
            return {"game_id": game_id, "leaderboard": cached_data["data"]}
            
    scores_ref = db.collection("daily_scores").document(game_id).collection("scores")
    # 시도 횟수가 적은 순서대로 10명 조회 (Top 10)
    query = scores_ref.order_by("attempts", direction=firestore.Query.ASCENDING).limit(10)
    
    results = []
    for doc in query.stream():
        data = doc.to_dict()
        results.append({
            "nickname": data.get("nickname"),
            "attempts": data.get("attempts"),
            "timestamp": data.get("timestamp")
        })
        
    _leaderboard_cache[cache_key] = {
        "timestamp": now,
        "data": results
    }
        
    return {"game_id": game_id, "leaderboard": results}

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
        
    # 총 승리 횟수가 많은 순서대로 10명 조회 (Top 10)
    query = db.collection("users").order_by("total_wins", direction=firestore.Query.DESCENDING).limit(10)
    
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
