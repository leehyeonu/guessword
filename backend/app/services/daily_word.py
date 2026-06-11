import os
import hashlib
from datetime import datetime, timezone, timedelta
import logging
import random
from typing import List, Dict
import threading

logger = logging.getLogger("malmatch.daily_word")

# 프로젝트 루트 경로 기준
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from cryptography.fernet import Fernet
from app.services.firestore_store import FirestoreStore

WORDS_FILE_PATH = os.path.join(BASE_DIR, "data", "words.enc")

_cached_words = []
_store = FirestoreStore()

def get_words_list() -> List[str]:
    """암호화된 단어 사전 파일(words.enc) 복호화 및 메모리 캐싱"""
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

_cached_daily_word = None
_cached_daily_word_round = 1
_cached_past_answers = None
_cached_past_rounds = None
_listener_registered = False

_past_answers_lock = threading.Lock()
_past_rounds_lock = threading.Lock()

def start_active_word_listener():
    """Firestore active 문서 실시간 구독(Snapshot Listener) 및 메모리 캐시 동기화"""
    global _listener_registered, _cached_daily_word, _cached_daily_word_round, _cached_past_answers, _cached_past_rounds
    if _listener_registered:
        return
    if not _store.enabled:
        return
        
    try:
        db = _store.client
        doc_ref = db.collection("daily_words").document("active")
        
        def on_snapshot(doc_snapshot, changes, read_time):
            global _cached_daily_word, _cached_daily_word_round, _cached_past_answers, _cached_past_rounds
            for doc in doc_snapshot:
                if doc.exists:
                    data = doc.to_dict()
                    if not data:
                        logger.warning("⚠️ [REALTIME] Firestore active document exists but has no data")
                        continue
                    word = data.get("word")
                    raw_round = data.get("round", 1)
                    
                    if not word or not isinstance(word, str):
                        logger.warning(f"⚠️ [REALTIME] Invalid word type or empty in active document: {word}")
                        continue
                    
                    try:
                        round_val = int(raw_round)
                        if round_val < 1:
                            round_val = 1
                    except (ValueError, TypeError):
                        logger.warning(f"⚠️ [REALTIME] Invalid round format in active document: {raw_round}, fallback to 1")
                        round_val = 1
                    
                    _cached_daily_word = word
                    _cached_daily_word_round = round_val
                    _cached_past_answers = None
                    _cached_past_rounds = None
                    logger.info(f"🔔 [REALTIME] Firestore 정답 변경 감지. 실시간 캐시 갱신 완료: '{word}' (회차: {round_val})")
                    
        doc_ref.on_snapshot(on_snapshot)
        _listener_registered = True
        logger.info("🚀 [SYSTEM] Firestore 'active' 단어 실시간 감시 리스너 등록 성공")
    except Exception as e:
        logger.warning(f"⚠️ [SYSTEM] Firestore 실시간 감시 리스너 등록 실패: {e}")

def get_daily_target_word() -> str:
    """인게임 활성 정답 단어 조회 (실시간 캐시 우선 참조)"""
    global _cached_daily_word, _cached_daily_word_round
    
    # 1회성 실시간 리스너 활성화
    if _store.enabled and not _listener_registered:
        start_active_word_listener()
        
    # 메모리 캐시가 준비되어 있으면 즉시 캐시 값 반환 (DB 쿼리 0회 유도)
    if _cached_daily_word:
        return _cached_daily_word
        
    if not _store.enabled:
        words = get_words_list()
        _cached_daily_word = random.choice(words)
        logger.info(f"💡 [SYSTEM] 로컬 정답 단어가 임의로 설정되었습니다: '{_cached_daily_word}'")
        return _cached_daily_word

    db = _store.client
    try:
        # 최초 구동 혹은 리스너 동작 대기 시간 대응을 위한 Fallback Point Read
        doc_ref = db.collection("daily_words").document("active")
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            if data:
                word = data.get("word")
                raw_round = data.get("round", 1)
                if word and isinstance(word, str):
                    try:
                        round_val = int(raw_round)
                        if round_val < 1:
                            round_val = 1
                    except (ValueError, TypeError):
                        round_val = 1
                    
                    _cached_daily_word = word
                    _cached_daily_word_round = round_val
                
                # 자가 치유(Self-healing) 로직:
                # 활성 단어가 이미 clears 컬렉션에 있으면, 이전 트랜잭션 에러 등으로 교체가 실패한 것으로 간주하여 즉시 교체합니다.
                if _store.enabled and _store.FieldFilter is not None:
                    try:
                        game_hash = get_game_id(word)
                        clears_ref = db.collection("clears").where(filter=_store.FieldFilter("gameId", "==", game_hash)).limit(1)
                        clears_snap = list(clears_ref.stream())
                        if clears_snap:
                            logger.warning(f"⚠️ [SYSTEM] 활성 단어 '{word}'이(가) 이미 클리어된 기록이 존재합니다. 자가 치유를 위해 단어를 교체합니다.")
                            rotated_word = rotate_target_word(word)
                            return rotated_word
                    except Exception as ex:
                        logger.warning(f"⚠️ [SYSTEM] 자가 치유 체크 중 오류 발생 (무시하고 계속 진행): {ex}")
                
                logger.info(f"💡 [SYSTEM] 활성 정답 단어가 최초 로드되었습니다: '{word}' (회차: {round_val})")
                return word
        
        # active 문서가 없는 경우 최초로 단어 생성
        transaction = db.transaction()
        meta_ref = db.collection("daily_words").document("metadata")
        
        @_store.firestore.transactional
        def init_active_word_in_transaction(transaction, doc_ref, meta_ref):
            snapshot = doc_ref.get(transaction=transaction)
            if snapshot.exists:
                data = snapshot.to_dict()
                return data.get("word"), data.get("round", 1)
            
            meta_snap = meta_ref.get(transaction=transaction)
            used_words = []
            round_counter = 1
            if meta_snap.exists:
                meta_data = meta_snap.to_dict()
                used_words = meta_data.get("used_words", [])
                round_counter = meta_data.get("round_counter", len(used_words) if used_words else 1)
            
            if round_counter < 1:
                round_counter = 1
                
            all_words = get_words_list()
            used_set = set(used_words)
            available = [w for w in all_words if w not in used_set]
            if not available:
                available = all_words
                used_words = []
                
            chosen = random.choice(available)
            used_words.append(chosen)
            
            kst = timezone(timedelta(hours=9))
            today_str = datetime.now(kst).strftime("%Y-%m-%d")
            
            transaction.set(doc_ref, {"word": chosen, "date": today_str, "round": round_counter})
            transaction.set(meta_ref, {
                "used_words": used_words,
                "round_counter": round_counter
            }, merge=True)
            return chosen, round_counter
            
        word, round_val = init_active_word_in_transaction(transaction, doc_ref, meta_ref)
        _cached_daily_word = word
        _cached_daily_word_round = round_val
        logger.info(f"💡 [SYSTEM] 새 활성 정답 단어가 설정되었습니다: '{word}' (회차: {round_val})")
        return word
    except Exception as e:
        logger.error(f"❌ [DB_ERROR] Firestore active word error: {e}")
        words = get_words_list()
        _cached_daily_word = words[0]
        _cached_daily_word_round = 1
        return _cached_daily_word

def get_daily_target_round() -> int:
    """인게임 활성 회차 번호 조회"""
    global _cached_daily_word_round
    if _cached_daily_word is None:
        get_daily_target_word()
    return _cached_daily_word_round

def get_past_answers() -> Dict[str, str]:
    """과거 정답 단어 해시 맵핑 데이터셋 조회 (최대 50개 제한)"""
    global _cached_past_answers
    if _cached_past_answers is not None:
        return _cached_past_answers

    if not _store.enabled:
        return {}

    with _past_answers_lock:
        if _cached_past_answers is not None:
            return _cached_past_answers

        db = _store.client
        try:
            docs = db.collection("daily_words").limit(50).stream()
            answers = {}
            for doc in docs:
                if doc.id in ("metadata", "active"):
                    continue
                data = doc.to_dict()
                if "word" in data:
                    word = data["word"]
                    game_hash = get_game_id(word)
                    answers[game_hash] = word
            _cached_past_answers = answers
            return answers
        except Exception as e:
            logger.error(f"❌ [DB_ERROR] Firestore past answers error: {e}")
            return {}

def get_past_rounds() -> Dict[str, int]:
    """과거 회차 정보 해시 맵핑 데이터셋 조회 (최대 50개 제한)"""
    global _cached_past_rounds
    if _cached_past_rounds is not None:
        return _cached_past_rounds

    if not _store.enabled:
        return {}

    with _past_rounds_lock:
        if _cached_past_rounds is not None:
            return _cached_past_rounds

        db = _store.client
        try:
            docs = db.collection("daily_words").limit(50).stream()
            rounds = {}
            for doc in docs:
                if doc.id in ("metadata", "active"):
                    continue
                data = doc.to_dict()
                if "word" in data:
                    word = data["word"]
                    game_hash = get_game_id(word)
                    rounds[game_hash] = data.get("round", 0)
            _cached_past_rounds = rounds
            return rounds
        except Exception as e:
            logger.error(f"❌ [DB_ERROR] Firestore past rounds error: {e}")
            return {}

def rotate_target_word(solved_word: str) -> str:
    """정답 단어 교체 처리 및 과거 기록 아카이빙 트랜잭션"""
    global _cached_daily_word, _cached_daily_word_round, _cached_past_answers, _cached_past_rounds
    
    if not _store.enabled:
        words = get_words_list()
        available = [w for w in words if w != solved_word]
        if not available:
            available = words
        chosen = random.choice(available)
        _cached_daily_word = chosen
        _cached_daily_word_round += 1
        _cached_past_answers = None
        _cached_past_rounds = None
        logger.info(f"🔄 [SYSTEM] (로컬) 정답 단어가 교체되었습니다: '{solved_word}' -> '{chosen}' (회차: {_cached_daily_word_round})")
        return chosen

    db = _store.client
    try:
        transaction = db.transaction()
        doc_ref = db.collection("daily_words").document("active")
        meta_ref = db.collection("daily_words").document("metadata")
        
        @_store.firestore.transactional
        def update_in_transaction(transaction, doc_ref, meta_ref, solved_word):
            # 1. READS FIRST
            snapshot = doc_ref.get(transaction=transaction)
            if not snapshot.exists:
                return None
                
            active_data = snapshot.to_dict()
            current_word = active_data.get("word")
            current_round = active_data.get("round", 1)
            
            if current_word != solved_word:
                logger.info(f"ℹ️ [SYSTEM] 정답 단어가 이미 교체되어 있습니다. (현재 DB: '{current_word}', 시도한 단어: '{solved_word}')")
                return current_word, current_round
                
            meta_snap = meta_ref.get(transaction=transaction)
            
            # 2. COMPUTATIONS & PREPARATIONS
            game_hash = get_game_id(solved_word)
            kst = timezone(timedelta(hours=9))
            today_str = datetime.now(kst).strftime("%Y-%m-%d")
            archive_ref = db.collection("daily_words").document(game_hash)
            solved_at_val = _store.firestore.SERVER_TIMESTAMP if _store.firestore else datetime.now(kst).isoformat()
            
            used_words = []
            round_counter = current_round
            if meta_snap.exists:
                meta_data = meta_snap.to_dict()
                used_words = meta_data.get("used_words", [])
                round_counter = meta_data.get("round_counter", current_round)
                
            all_words = get_words_list()
            used_set = set(used_words)
            available = [w for w in all_words if w not in used_set]
            if not available:
                available = all_words
                used_words = []
                
            chosen = random.choice(available)
            used_words.append(chosen)
            
            # 회차 번호 1 증가
            next_round = round_counter + 1
            
            # 3. WRITES LAST
            # 이전 단어 아카이브 (과거 목록용)
            transaction.set(archive_ref, {
                "word": solved_word,
                "date": today_str,
                "solved_at": solved_at_val,
                "round": current_round
            })
            # active 문서 업데이트 및 metadata 업데이트
            transaction.set(doc_ref, {"word": chosen, "date": today_str, "round": next_round})
            transaction.set(meta_ref, {
                "used_words": used_words,
                "round_counter": next_round
            }, merge=True)
            
            logger.info(f"🔄 [SYSTEM] 정답 단어가 성공적으로 교체되었습니다: '{solved_word}'(#{current_round}) -> '{chosen}'(#{next_round})")
            return chosen, next_round
            
        chosen, next_round = update_in_transaction(transaction, doc_ref, meta_ref, solved_word)
        if chosen:
            _cached_daily_word = chosen
            _cached_daily_word_round = next_round
            _cached_past_answers = None
            _cached_past_rounds = None
        return _cached_daily_word
    except Exception as e:
        logger.error(f"❌ [DB_ERROR] Firestore rotate word error: {e}")
        return _cached_daily_word

def get_game_id(target_word: str) -> str:
    """정답 단어 단방향 SHA-256 해싱 (레인보우 사전 공격 차단용 솔트 적용)"""
    salt = os.getenv("GAME_ID_SALT", "").strip()
    if not salt:
        logger.warning("🚨 [SECURITY WARNING] GAME_ID_SALT 환경변수가 정의되어 있지 않습니다. 사전 해시 대조 공격에 극도로 취약합니다!")
        
    hasher = hashlib.sha256()
    if salt:
        hasher.update(salt.encode("utf-8"))
        hasher.update(b":")
    hasher.update(target_word.encode("utf-8"))
    return hasher.hexdigest()
