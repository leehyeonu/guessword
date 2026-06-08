# K-Semantle (한국어 꼬맨틀 게임)

제시된 단어와 정답 단어 사이의 유사도를 비교해서 숨겨진 단어를 맞추는 게임입니다. 원래 유명한 Semantle 게임의 한국어 버전입니다.

FastAPI 백엔드에서 FastText 한국어 모델로 두 단어의 유사도와 순위를 계산하고, Next.js 프론트엔드로 깔끔하고 반응성 좋은 UI를 띄워줍니다.

---

## 폴더 구조
```text
guessword/
├── backend/            # FastAPI 서버 및 Dockerfile
├── frontend/           # Next.js 프론트엔드
├── models/             # FastText 사전 모델 파일 (.bin) 위치
├── docker-compose.yml  # 도커 컴포즈 실행용 파일
└── README.md           # 이 가이드 문서
```

---

## 1. FastText 한국어 모델 다운로드
단어 간 유사도를 비교하려면 페이스북 FastText 한국어 사전 파일이 필요합니다.

1. 아래 링크에서 모델을 다운로드합니다.
   - **[cc.ko.300.bin.gz 다운로드](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.bin.gz)**
2. 다운로드 완료 후 압축을 풀어줍니다.
3. 압축이 풀린 `cc.ko.300.bin` (약 4.5GB) 파일을 프로젝트 루트의 **`models/`** 폴더에 넣어주세요.
   ```bash
   # 최종 경로가 이렇게 되어야 함
   guessword/models/cc.ko.300.bin
   ```

---

## 2. 백엔드 실행 방법

### 방법 A. 도커(Docker Compose)로 띄우기
도커가 깔끔하게 실행됩니다. 로컬 메모리는 최소 8GB 이상 확보하는 것을 권장합니다.

```bash
# 컨테이너 빌드 및 백그라운드 구동
docker-compose up -d --build

# 서버 로그 확인 (FastText 로딩 상태 등)
docker-compose logs -f
```
- API 주소: `http://localhost:8000`
- Swagger 문서: `http://localhost:8000/docs`

### 방법 B. 로컬 파이썬(Python)으로 직접 실행
```bash
cd backend

# 가상환경 세팅
python3 -m venv venv
source venv/bin/activate  # 윈도우는 venv\Scripts\activate

# 패키지 설치
pip install -r requirements.txt

# 서버 띄우기
uvicorn app.main:app --reload
```

---

## 3. 프론트엔드 실행 방법

로컬에 Node.js가 깔려있어야 합니다.

```bash
cd frontend

# 패키지 설치
npm install

# 환경 설정
# .env.local 파일을 만들고 백엔드 API 주소와 Firebase 키를 적어줍니다.
# 만약 Firebase를 연동하지 않으면 자동으로 로컬 오프라인 모드로 돌아갑니다.
```

- **Firebase 세팅**: 실시간 전광판 랭킹이나 클리어 로그를 남기려면 Firebase 콘솔에서 만든 프로젝트 키를 `frontend/.env.local` 에 기입해주세요.

```bash
# 로컬 개발 서버 실행
npm run dev
```
- 브라우저 접속: `http://localhost:3000`

---

## ⚙️ 게임 룰 & 정답 단어 바꾸기
- **룰**: 단어를 입력하면 0~100점 사이로 유사도가 계산됩니다. 정답 단어와 유사한 상위 1,000위 단어에 진입하면 50점 이상이 되며, 글래스 보드 뒷배경이 붉은색으로 환하게 바뀝니다.
- **정답 바꾸기 (비밀 관리자 패널)**:
  - 프론트엔드 화면 우측 상단 톱니바퀴나 제어바 구석에 있는 미세한 회색 점(`.`)을 누르면 관리자 모달이 열립니다.
  - 여기에 새로운 정답 단어를 입력하고 저장하면 됩니다. (사전에 없는 단어면 백엔드 검증 과정에서 튕깁니다.)
