FROM python:3.10-slim

# 1. 시스템 도구 설치 (기본 도구만 유지)
USER root
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 허깅페이스 보안 기준에 맞춘 사용자 설정
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# 3. 4.5GB 모델 다운로드를 허깅페이스 내부망(Hugging Face Hub)을 통해 초고속 다운로드
# 페이스북 CDN 대신 HF 내부망을 사용하며 압축 해제 과정도 생략되어 빌드 시간이 극단적으로 단축됩니다.
# (huggingface-cli 대신 python 스크립트로 안정적인 다운로드 수행)
RUN pip install --no-cache-dir huggingface_hub && \
    mkdir -p $HOME/app/models && \
    python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='facebook/fasttext-ko-vectors', filename='model.bin', local_dir='/home/user/app/models')" && \
    mv $HOME/app/models/model.bin $HOME/app/models/cc.ko.300.bin

# 4. 패키지 설치를 위해 요구사항 파일 복사 및 실행
COPY --chown=user requirements.txt $HOME/app/
RUN pip install --no-cache-dir --user -r requirements.txt

# 5. 나머지 백엔드 소스 코드 복사
COPY --chown=user . $HOME/app

# 6. 허깅페이스 전용 포트(7860)로 서버 실행 (액세스 로그 비활성화하여 로그 깔끔하게 유지)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log"]

