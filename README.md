# 말맞춤 (MalMatch) — 한국어 단어 추측 게임

유사도를 비교하며 숨겨진 비밀 단어를 유추해내는 게임입니다. FastAPI 백엔드에서 FastText 한국어 모델로 두 단어의 유사도를 계산하고, Next.js 프론트엔드로 깔끔하고 반응성 좋은 UI를 띄워줍니다.

---

## 아키텍처

```text
[사용자 브라우저]
       │
       ▼
[Vercel (Next.js 프론트엔드)]
       │  /api/* 프록시 라우트
       │  (HF_TOKEN 주입)
       ▼
[Hugging Face Spaces (Private)]
  FastAPI 백엔드
  + FastText 모델 (런타임 다운로드)
  + Firestore 연동
```

- **프론트엔드**: Vercel에 배포된 Next.js 앱
- **백엔드**: Hugging Face Spaces (Private)에 배포된 FastAPI 서버
- **프록시**: 프론트엔드의 Next.js API Route(`/api/[...path]`)가 모든 백엔드 요청을 중계하며, Private Space 접근용 `HF_TOKEN`을 자동 주입합니다.
- **데이터베이스**: Firebase Firestore (시도 기록, 리더보드, 사용자 계정)

---

## 폴더 구조
```text
guessword/
├── backend/              # FastAPI 서버 및 Dockerfile
│   ├── app/
│   │   ├── api/          # API 라우트 (guess, auth, leaderboard)
│   │   ├── data/         # 암호화된 정답 단어 목록 (words.enc)
│   │   └── services/     # NLP, 일일 단어, Firestore 연동
│   ├── scripts/          # 단어 암호화 스크립트
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/             # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/[...path]/  # 백엔드 프록시 라우트
│   │   │   └── page.tsx        # 메인 게임 페이지
│   │   └── components/         # UI 컴포넌트
│   └── .env.local              # 로컬 환경변수
├── models/               # FastText 사전 모델 (.bin) — 로컬 개발용
├── deploy.sh             # 원클릭 배포 스크립트
├── docker-compose.yml    # 로컬 도커 실행용
└── README.md             # 이 가이드 문서
```

---

## 주요 기능

### 🎯 일일 정답 단어 로테이션
- 매일 자정(KST) 기준으로 정답 단어가 자동 변경됩니다.
- 정답 단어 목록은 `words.enc`에 암호화되어 저장되며, 서버 기동 시 복호화됩니다.

### 👤 계정 시스템 및 익명 마이그레이션
- 로그인 없이도 `익명#XXXX` 닉네임으로 즉시 플레이 가능합니다.
- 회원가입/로그인 시 익명 시절의 모든 기록(시도, 클리어, 리더보드 점수)이 자동으로 계정에 연동됩니다.
- JWT 기반 인증 (30일 만료)

### 🏆 리더보드
- **오늘 (일일)**: 정답을 맞춘 사용자 중 시도 횟수가 적은 순
- **전체 (명예의 전당)**: 누적 정답 횟수가 많은 순

### 🔒 보안
- 백엔드는 Private HF Space로 외부에서 직접 접근 불가
- 모든 API 요청은 프론트엔드 프록시를 통해 Bearer 토큰이 자동 주입됨
- 정답 단어 목록은 Fernet 대칭키로 암호화

---

## 1. FastText 한국어 모델 (로컬 개발용)

> **참고**: Hugging Face Spaces 배포 시에는 서버 기동 시 자동으로 모델을 다운로드하므로 이 단계가 필요 없습니다.

단어 간 유사도를 비교하려면 페이스북 FastText 한국어 사전 파일이 필요합니다.

1. 아래 링크에서 모델을 다운로드합니다.
   - **[cc.ko.300.bin.gz 다운로드](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.bin.gz)**
2. 다운로드 완료 후 압축을 풀어줍니다.
3. 압축이 풀린 `cc.ko.300.bin` (약 4.5GB) 파일을 프로젝트 루트의 **`models/`** 폴더에 넣어주세요.
   ```bash
   guessword/models/cc.ko.300.bin
   ```

---

## 2. 백엔드 실행 방법

### 방법 A. 도커(Docker Compose)로 띄우기
```bash
docker-compose up -d --build
docker-compose logs -f
```
- API 주소: `http://localhost:8000`
- Swagger 문서: `http://localhost:8000/docs`

### 방법 B. 로컬 파이썬으로 직접 실행
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## 3. 프론트엔드 실행 방법

```bash
cd frontend
npm install
npm run dev
```
- 브라우저 접속: `http://localhost:3000`

### 환경변수 설정

#### 로컬 개발용 (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

#### Vercel 환경변수 (프로덕션 배포용)
| 변수명 | 설명 |
|--------|------|
| `HF_API_URL` | Private HF Space 백엔드 URL |
| `HF_TOKEN` | Hugging Face 액세스 토큰 (READ 권한) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase 클라이언트 키 (6개) |

> ⚠️ **중요**: Vercel에서 `NEXT_PUBLIC_API_URL`을 설정하지 마세요. 프록시를 우회하여 404 오류가 발생합니다.

---

## 4. 배포

```bash
./deploy.sh "커밋 메시지"
```
순서: Git 커밋 → GitHub 푸시 (Vercel 자동 배포) → HF Spaces 백엔드 동기화

---

## ⚙️ 게임 룰 & 정답 단어 관리
- **룰**: 단어를 입력하면 0~100점 사이로 유사도가 계산됩니다. 상위 1,000개 유사어에 진입하면 50점 이상이 되며, 글래스 보드가 붉은색으로 바뀝니다.
- **정답 변경**: 매일 자정(KST) 자동 로테이션. `backend/scripts/encrypt_words.py`로 관리합니다.
