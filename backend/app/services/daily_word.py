import os
import hashlib
import datetime
import logging
from typing import List

logger = logging.getLogger("guessword.daily_word")

# 프로젝트 루트(app 기준 부모 디렉토리 또는 data 폴더)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from cryptography.fernet import Fernet

WORDS_FILE_PATH = os.path.join(BASE_DIR, "data", "words.enc")

_cached_words = []

def get_words_list() -> List[str]:
    """words.enc 파일에서 암호화된 단어 목록을 해독하여 로드합니다. 서버 기동 시/최초 호출 시 메모리에 캐싱됩니다."""
    global _cached_words
    if _cached_words:
        return _cached_words
    
    decryption_key = os.getenv("WORDS_DECRYPTION_KEY", "").strip()
    if not decryption_key:
        logger.error("WORDS_DECRYPTION_KEY 환경변수가 설정되지 않았습니다.")
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
        logger.info(f"정답 단어 목록 {len(_cached_words)}개를 안전하게 해독하여 로드했습니다.")
        return _cached_words
    except Exception as e:
        logger.error(f"words.enc 로드 및 해독 중 에러: {e}")
        # 복호화 실패 시 최소한의 기본 단어 제공
        return ["사과", "우주", "바다", "컴퓨터"]

def get_daily_target_word() -> str:
    """오늘 날짜와 SECRET_SALT를 결합하여 일관된(그러나 예측 불가능한) 난수 해시로 오늘의 단어를 선택합니다."""
    # 만약 TARGET_WORD 환경변수가 명시적으로 지정되어 있으면 (테스트/비상용) 그것을 최우선으로 반환
    env_target = os.getenv("TARGET_WORD", "").strip()
    if env_target:
        return env_target
        
    words = get_words_list()
    
    # 한국 시간(KST) 기준으로 날짜를 가져오거나, UTC 기준으로 가져옵니다.
    # 서버 시간대에 의존하지 않도록 UTC 기반에 9시간 더하는 등 명시적 처리를 할 수도 있지만, 
    # 여기서는 서버의 로컬 날짜를 사용합니다. (필요 시 수정 가능)
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    
    # 예측 불가능하게 만드는 비밀 솔트 (미설정 시 기본값 fallback)
    salt = os.getenv("DAILY_WORD_SALT", "fallback-secret-salt-12345").strip()
    
    # 날짜와 솔트를 이어붙임
    raw_str = f"{today_str}:{salt}"
    
    # SHA-256 해시 연산 후 정수로 변환
    hash_obj = hashlib.sha256(raw_str.encode("utf-8"))
    hash_int = int(hash_obj.hexdigest(), 16)
    
    # 전체 단어 수로 나눈 나머지를 인덱스로 사용
    index = hash_int % len(words)
    return words[index]
