import os
import hashlib
from datetime import datetime, timezone, timedelta
import logging
import random
from typing import List, Dict

logger = logging.getLogger("guessword.daily_word")

# 프로젝트 루트(app 기준 부모 디렉토리 또는 data 폴더)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from cryptography.fernet import Fernet
from app.services.firestore_store import FirestoreStore

WORDS_FILE_PATH = os.path.join(BASE_DIR, "data", "words.enc")

_cached_words = []
_store = FirestoreStore()

def get_words_list() -> List[str]:
    """words.enc 파일에서 암호화된 단어 목록을 해독하여 로드합니다. 서버 기동 시/최초 호출 시 메모리에 캐싱됩니다."""
    global _cached_words
    if _cached_words:
        return _cached_words
    
    decryption_key = os.getenv("WORDS_DECRYPTION_KEY", "").strip().strip("'\"")
    if not decryption_key:
        logger.error("❌ [SYSTEM] WORDS_DECRYPTION_KEY 환경변수가 설정되지 않았습니다. (기본 단어로 대체됨)")
        return ["사과", "우주", "바다", "컴퓨터"]

    try:
        fernet = Fernet(decryption_key)
        
        with open(WORDS_FILE_PATH, "rb") as f:
            encrypted_data = f.read()
            
        decrypted_data = fernet.decrypt(encrypted_data).decode("utf-8")
        words = [line.strip() for line in decrypted_data.split('\n') if line.strip()]
        
        if not words:
            raise ValueError("해독된 단어 목록이 비어 있습니다.")
            
        _cached_words = words
        logger.info(f"🚀 [SYSTEM] 정답 단어 목록 {len(_cached_words)}개를 안전하게 해독하여 로드했습니다.")
        return _cached_words
    except Exception as e:
        logger.error(f"❌ [SYSTEM] words.enc 로드 및 해독 중 에러: {e}")
        # 복호화 실패 시 최소한의 기본 단어 제공
        return ["사과", "우주", "바다", "컴퓨터"]

def get_daily_state(today_str: str) -> dict:
    if not _store.enabled:
        return None
    db = _store.client
    try:
        doc_ref = db.collection("daily_words").document(today_str)
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        
        transaction = db.transaction()
        meta_ref = db.collection("daily_words").document("metadata")
        
        @_store.firestore.transactional
        def update_in_transaction(transaction, doc_ref, meta_ref, today_str):
            snapshot = doc_ref.get(transaction=transaction)
            if snapshot.exists:
                return snapshot.to_dict()
            
            meta_snap = meta_ref.get(transaction=transaction)
            used_words = []
            if meta_snap.exists:
                used_words = meta_snap.to_dict().get("used_words", [])
                
            all_words = get_words_list()
            available = [w for w in all_words if w not in used_words]
            if not available:
                available = all_words
                used_words = []
                
            chosen = random.choice(available)
            used_words.append(chosen)
            
            transaction.set(doc_ref, {"word": chosen, "date": today_str})
            transaction.set(meta_ref, {"used_words": used_words}, merge=True)
            return {"word": chosen, "date": today_str}
            
        return update_in_transaction(transaction, doc_ref, meta_ref, today_str)
    except Exception as e:
        logger.error(f"❌ [DB_ERROR] Firestore daily word error: {e}")
        return None

def get_past_answers() -> Dict[str, str]:
    if not _store.enabled:
        return {}
    db = _store.client
    kst = timezone(timedelta(hours=9))
    today_str = datetime.now(kst).strftime("%Y-%m-%d")
    try:
        docs = db.collection("daily_words").limit(50).stream()
        answers = {}
        for doc in docs:
            if doc.id == "metadata" or doc.id == today_str:
                continue
            data = doc.to_dict()
            if "word" in data:
                answers[doc.id] = data["word"]
        return answers
    except Exception as e:
        logger.error(f"❌ [DB_ERROR] Firestore past answers error: {e}")
        return {}

def get_daily_target_word() -> str:
    """오늘 날짜를 기준으로 랜덤 출제하며, 중복을 방지합니다."""
    kst = timezone(timedelta(hours=9))
    today_str = datetime.now(kst).strftime("%Y-%m-%d")
    
    state = get_daily_state(today_str)
    if state and "word" in state:
        word = state["word"]
        logger.info(f"💡 [SYSTEM] 오늘의 정답 단어는 '{word}' 입니다. (날짜: {today_str})")
        return word
        
    # Fallback to deterministic
    words = get_words_list()
    salt = os.getenv("DAILY_WORD_SALT", "fallback-secret-salt-12345").strip()
    raw_str = f"{today_str}:{salt}"
    hash_obj = hashlib.sha256(raw_str.encode("utf-8"))
    hash_int = int(hash_obj.hexdigest(), 16)
    index = hash_int % len(words)
    return words[index]

def get_game_id(target_word: str) -> str:
    """정답 단어의 해시값(SHA-256)을 구합니다."""
    hasher = hashlib.sha256()
    salt = os.getenv("GAME_ID_SALT", "").strip()
    if salt:
        hasher.update(salt.encode("utf-8"))
        hasher.update(b":")
    hasher.update(target_word.encode("utf-8"))
    return hasher.hexdigest()
