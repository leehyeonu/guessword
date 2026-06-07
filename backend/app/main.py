import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Use relative imports within app
from app.api.routes import router as api_router, limiter
from app.services.nlp import FastTextWrapper

# Setup logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("guessword.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler. Loads the FastText model into memory exactly once at startup
    and handles cleanups upon shutdown.
    """
    logger.info("Initializing application startup...")

    # Define potential paths for models/cc.ko.300.bin
    # The application supports being run from either the root folder or the backend folder
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
        # Since the model file is downloading, log a clear warning message rather than
        # completely preventing FastAPI initialization. Endpoints will return HTTP 500.
        logger.warning(
            "WARNING: FastText model file 'models/cc.ko.300.bin' not found. "
            "Please ensure the file is downloaded to the correct path before starting the game."
        )
        app.state.nlp_wrapper = None
    else:
        try:
            logger.info(f"Target model file found: {model_path}")
            app.state.nlp_wrapper = FastTextWrapper(model_path)
        except Exception as e:
            logger.error(f"Critical error loading FastText model: {e}", exc_info=True)
            app.state.nlp_wrapper = None

    yield

    # Clean up resources on shutdown
    logger.info("Shutting down application...")
    if hasattr(app.state, "nlp_wrapper") and app.state.nlp_wrapper is not None:
        del app.state.nlp_wrapper
        logger.info("Cleaned up FastText model resources.")


# Create FastAPI App Instance
app = FastAPI(
    title="Korean Word Similarity Guessing Game Backend",
    description="Backend API for 꼬맨틀-like semantic similarity game, built with FastAPI, FastText, and NumPy.",
    version="1.0.0",
    lifespan=lifespan
)

# Hook up slowapi Rate Limiting Limiter and Exception Handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS for frontend web integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router, prefix="/api")


@app.get("/")
def index():
    return {
        "status": "online",
        "message": "Guessword Backend API is active.",
        "model_loaded": app.state.nlp_wrapper is not None if hasattr(app.state, "nlp_wrapper") else False
    }
