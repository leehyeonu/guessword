import os
import logging
import unicodedata
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# .env 환경변수 읽기
load_dotenv()

# 앱 내부의 상대 경로 임포트 사용
from app.api.routes import router as api_router, limiter
from app.services.nlp import FastTextWrapper

# 로깅 설정 구성
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("guessword.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    라이프사이클 이벤트 핸들러. 서버 시작 시 메모리에 FastText 모델을 정확히 한 번 로드하고,
    종료 시 리소스를 정리합니다.
    """
    logger.info("애플리케이션 시작 초기화 중...")

    # models/cc.ko.300.bin의 후보 경로 정의
    # 애플리케이션은 루트 폴더 또는 백엔드 폴더 어디서 실행되든 지원합니다.
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
        # 모델 파일이 다운로드 중이거나 없는 경우, FastAPI 초기화를 완전히 막는 대신 
        # 명확한 경고 메시지를 기록합니다. 엔드포인트 호출 시 HTTP 500을 반환합니다.
        logger.warning(
            "경고: FastText 모델 파일 'models/cc.ko.300.bin'을 찾을 수 없습니다. "
            "게임 시작 전에 올바른 경로에 파일이 다운로드되었는지 확인해 주세요."
        )
        app.state.nlp_wrapper = None
    else:
        try:
            logger.info(f"대상 모델 파일을 찾았습니다: {model_path}")
            app.state.nlp_wrapper = FastTextWrapper(model_path)
        except Exception as e:
            logger.error(f"FastText 모델 로드 중 심각한 오류 발생: {e}", exc_info=True)
            app.state.nlp_wrapper = None

    # 정답 단어 환경변수 로드 로직
    env_target = os.getenv("TARGET_WORD", "").strip()
    if env_target:
        app.state.target_word = unicodedata.normalize('NFC', env_target)
        logger.info(f"환경변수에서 정답 단어를 로드했습니다 (NFC): {app.state.target_word}")
    else:
        app.state.target_word = "사과"
        logger.info(f"TARGET_WORD 환경변수가 지정되지 않아 기본값 '사과'로 정답을 설정합니다.")

    yield

    # 종료 시 리소스 정리
    logger.info("애플리케이션 종료 중...")
    if hasattr(app.state, "nlp_wrapper") and app.state.nlp_wrapper is not None:
        del app.state.nlp_wrapper
        logger.info("FastText 모델 리소스를 정리했습니다.")


# FastAPI 앱 인스턴스 생성
app = FastAPI(
    title="한국어 단어 유사도 추정 게임 백엔드",
    description="FastAPI, FastText, NumPy로 구축된 꼬맨틀 스타일의 의미론적 유사도 게임 백엔드 API입니다.",
    version="1.0.0",
    lifespan=lifespan
)

# slowapi 속도 제한(Rate Limiting) 및 예외 핸들러 연결
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 프론트엔드 웹 연동을 위한 CORS 구성
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

# API 라우터 포함
app.include_router(api_router, prefix="/api")


@app.get("/")
def index():
    return {
        "status": "온라인",
        "message": "단어 추정 백엔드 API가 활성화되어 있습니다.",
        "model_loaded": app.state.nlp_wrapper is not None if hasattr(app.state, "nlp_wrapper") else False
    }

