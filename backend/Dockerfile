FROM python:3.10-slim

# 1. 시스템 도구 설치 (기본 도구만 유지)
USER root
RUN apt-get update && apt-get install -y \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# 시간대를 KST(Asia/Seoul)로 설정하여 로그 시간을 한국 시간으로 맞춤
ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 2. 허깅페이스 보안 기준에 맞춘 사용자 설정
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# 3. 패키지 설치를 위해 요구사항 파일 복사 및 실행
COPY --chown=user requirements.txt $HOME/app/
RUN pip install --no-cache-dir --user -r requirements.txt

# 5. 나머지 백엔드 소스 코드 복사
COPY --chown=user . $HOME/app

# 6. 허깅페이스 전용 포트(7860)로 서버 실행 (액세스 로그 비활성화하여 로그 깔끔하게 유지)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log"]

