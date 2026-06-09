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
from app.services.firestore_store import FirestoreStore
from app.services.nlp import FastTextWrapper

# 기본 로깅 세팅
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("guessword.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    서버 구동 시 FastText 모델 로드하고, 종료 시 메모리 해제
    """
    logger.info("App 초기화 시작...")

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

    if not model_path:
        # 모델이 없는 경우 경고만 띄우고 구동 (API 호출 시 500 에러 반환)
        logger.warning(
            "경고: 모델 파일 'models/cc.ko.300.bin'을 찾을 수 없습니다. 경로를 확인해 주세요."
        )
        app.state.nlp_wrapper = None
    else:
        try:
            logger.info(f"모델 파일 위치: {model_path}")
            app.state.nlp_wrapper = FastTextWrapper(model_path)
        except Exception as e:
            logger.error(f"FastText 로딩 중 에러 발생: {e}", exc_info=True)
            app.state.nlp_wrapper = None

    logger.info("정답 단어 관리는 daily_word 모듈에서 처리됩니다.")

    app.state.firestore_store = FirestoreStore()
    if not app.state.firestore_store.enabled:
        logger.warning("Firestore 기록/조회 기능이 비활성화된 상태로 실행됩니다.")

    yield

    # 종료 시 리소스 정리
    logger.info("서버 종료 중...")
    if hasattr(app.state, "nlp_wrapper") and app.state.nlp_wrapper is not None:
        del app.state.nlp_wrapper
        logger.info("FastText 모델 메모리 해제 완료")


app = FastAPI(
    title="K-Semantle API",
    description="한국어 단어 유사도 측정 게임 API",
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


@app.get("/")
def index():
    return {
        "status": "online",
        "message": "K-Semantle backend API is running.",
        "model_loaded": app.state.nlp_wrapper is not None if hasattr(app.state, "nlp_wrapper") else False
    }
