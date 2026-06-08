# K-Semantle Backend (FastAPI)

FastAPI와 FastText 한국어 사전을 이용한 유사도 비교 백엔드 서버입니다.

## 로컬 실행 방법

1. 가상환경 세팅 및 활성화:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. 라이브러리 설치:
   ```bash
   pip install -r requirements.txt
   ```

3. FastText 모델 파일 준비:
   `models/cc.ko.300.bin` 경로에 페이스북 한국어 사전 모델이 다운로드되어 있어야 정상 기동됩니다.

4. 서버 실행:
   ```bash
   uvicorn app.main:app --reload
   ```
   `http://localhost:8000`에서 실행됩니다.
