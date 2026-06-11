# ==============================================================================
# Builder Stage
# ==============================================================================
FROM python:3.10-slim AS builder

WORKDIR /build

# 컴파일 및 종속성 빌드용 필수 패키지 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# --user 플래그를 사용하여 /root/.local 디렉토리에 패키지 설치
RUN pip install --no-cache-dir --user -r requirements.txt

# ==============================================================================
# Runtime Stage
# ==============================================================================
FROM python:3.10-slim AS runtime

# 시간대를 KST(Asia/Seoul)로 설정
ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 보안 권한 최소화를 위해 비-루트 사용자 생성
RUN useradd -m -u 1000 user

ENV HOME=/home/user
ENV PATH=$HOME/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR $HOME/app

# Builder 스테이지에서 설치된 python 패키지 복사 및 소유권 조정
COPY --from=builder --chown=user:user /root/.local $HOME/.local

# 백엔드 소스 코드 복사 (소유권 user로 지정)
COPY --chown=user:user . $HOME/app

# curl/wget 등 외부 유틸리티 대신 파이썬 내장 라이브러리를 활용한 안전한 헬스체크
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request, sys; \
                  try: \
                      res = urllib.request.urlopen('http://localhost:7860/health'); \
                      sys.exit(0) if res.status == 200 else sys.exit(1); \
                  except Exception: \
                      sys.exit(1)"

# 비-루트 사용자로 컨테이너 실행
USER user

# Uvicorn 실행 (허깅페이스 전용 포트 7860 사용, 액세스 로그 비활성화)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log"]
