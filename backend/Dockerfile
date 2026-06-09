FROM python:3.10-slim

# 1. 다운로드 및 모델 빌드에 필요한 도구 설치 (aria2, pigz 추가)
USER root
RUN apt-get update && apt-get install -y \
    wget \
    build-essential \
    aria2 \
    pigz \
    && rm -rf /var/lib/apt/lists/*

# 2. 허깅페이스 보안 기준에 맞춘 사용자 설정
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# 3. 4.5GB 모델 파일을 먼저 다운로드 (requirements.txt 변경 시에도 캐시 유지)
# aria2c로 병렬 다운로드, pigz로 병렬 압축 해제하여 속도 극대화
RUN mkdir -p $HOME/app/models && \
    aria2c -x 16 -s 16 https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.bin.gz -d $HOME/app/models -o cc.ko.300.bin.gz && \
    pigz -d $HOME/app/models/cc.ko.300.bin.gz

# 4. 패키지 설치를 위해 요구사항 파일 복사 및 실행
COPY --chown=user requirements.txt $HOME/app/
RUN pip install --no-cache-dir --user -r requirements.txt

# 5. 나머지 백엔드 소스 코드 복사
COPY --chown=user . $HOME/app

# 6. 허깅페이스 전용 포트(7860)로 서버 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]

