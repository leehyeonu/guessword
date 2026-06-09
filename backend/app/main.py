import os
import logging
import unicodedata
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# env 로드
load_dotenv()

from app.api.routes import router as api_router, limiter
from app.api.auth import router as auth_router
from app.api.leaderboard import router as leaderboard_router
from app.services.firestore_store import FirestoreStore
from app.services.nlp import FastTextWrapper
from app.services.daily_word import get_words_list, get_daily_target_word

# 기본 로깅 세팅 (KST 기준)
from datetime import datetime, timezone, timedelta
kst_tz = timezone(timedelta(hours=9))
logging.Formatter.converter = lambda *args: datetime.now(kst_tz).timetuple()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("malmatch.main")


import threading

def load_model_background(app, path):
    try:
        from huggingface_hub import hf_hub_download
        if path:
            logger.info(f"🚀 [SYSTEM] FastText 모델 백그라운드 로드 시작 (로컬 경로): {path}")
            model_path = path
        else:
            logger.info("🚀 [SYSTEM] 로컬 모델 파일을 찾지 못했습니다. Hugging Face Hub에서 다운로드합니다...")
            model_path = hf_hub_download(repo_id="facebook/fasttext-ko-vectors", filename="model.bin")
            logger.info(f"🚀 [SYSTEM] Hugging Face Hub 다운로드 완료: {model_path}")

        from app.services.nlp import FastTextWrapper
        app.state.nlp_wrapper = FastTextWrapper(model_path)
        logger.info("🚀 [SYSTEM] FastText 모델 로드 성공! 이제 게임을 시작할 수 있습니다.")
    except Exception as e:
        logger.error(f"❌ [SYSTEM] FastText 로딩 중 에러 발생: {e}", exc_info=True)
        app.state.nlp_wrapper = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    서버 구동 시 FastText 모델 로드하고, 종료 시 메모리 해제
    """
    logger.info("🚀 [SYSTEM] App 초기화 시작...")
    
    # 정답 단어 목록 해독 및 캐싱, 오늘의 단어 세팅
    get_words_list()
    get_daily_target_word()

    # 구동 환경에 따른 모델 파일 상대 경로 후보군
    candidate_paths = [
        "models/cc.ko.300.bin",
        "../models/cc.ko.300.bin",
        "../../models/cc.ko.300.bin",
        os.path.join(os.path.dirname(__file__), "../models/cc.ko.300.bin"),
        os.path.join(os.path.dirname(__file__), "../../models/cc.ko.300.bin"),
    ]

    model_path = None
    for p in candidate_paths:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            model_path = abs_p
            break

    app.state.nlp_wrapper = "LOADING"
    # FastAPI 서버가 즉시 응답할 수 있도록 백그라운드 스레드에서 무거운 모델 로딩 및 다운로드
    threading.Thread(target=load_model_background, args=(app, model_path), daemon=True).start()

    app.state.firestore_store = FirestoreStore()
    if not app.state.firestore_store.enabled:
        logger.warning("⚠️ [SYSTEM] Firestore 기록/조회 기능이 비활성화된 상태로 실행됩니다.")

    yield

    # 종료 시 리소스 정리
    logger.info("🛑 [SYSTEM] 서버 종료 중...")
    if hasattr(app.state, "nlp_wrapper") and app.state.nlp_wrapper is not None:
        del app.state.nlp_wrapper
        logger.info("🛑 [SYSTEM] FastText 모델 메모리 해제 완료")


app = FastAPI(
    title="MalMatch API",
    description="말맞춤 - 한국어 단어 유사도 측정 게임 API",
    version="1.0.0",
    lifespan=lifespan
)

# SlowAPI 레이트 리밋 예외 핸들러 등록
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS 설정
cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if cors_origins_raw == "*":
    allow_origins = ["*"]
else:
    allow_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(leaderboard_router, prefix="/api/leaderboard", tags=["leaderboard"])


@app.get("/")
def index():
    return {
        "status": "online",
        "message": "MalMatch backend API is running.",
        "model_loaded": app.state.nlp_wrapper is not None if hasattr(app.state, "nlp_wrapper") else False
    }
