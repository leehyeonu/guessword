# K-Semantle (한국어 단어 의미 추정 게임)

이 프로젝트는 단어 간의 의미적 유사성을 기반으로 비밀 정답 단어를 찾아내는 **꼬맨틀(Semantle)** 형식의 한국어 단어 추정 게임 웹 서비스입니다. 

FastAPI 백엔드는 FastText 한국어 사전을 사용하여 입력한 두 단어의 코사인 유사도와 상위 순위를 연산하고, Next.js(React) 프론트엔드는 Liquid Glass 디자인 시스템 및 모션 효과를 활용하여 몰입감 있는 플레이 화면을 선사합니다.

---

## 📂 프로젝트 폴더 구조
```text
guessword/
├── backend/            # FastAPI 백엔드 애플리케이션 및 Dockerfile
├── frontend/           # Next.js 프론트엔드 애플리케이션 및 .env.local
├── models/             # FastText 바이너리 모델 파일 저장 공간 (호스트 공유 볼륨)
├── docker-compose.yml  # 도커 컴포즈 실행 스펙
└── README.md           # 이 설치 가이드 문서
```

---

## 🚀 1. FastText 한국어 사전 모델 다운로드
백엔드가 단어 간 의미론적 관계를 분석하기 위해 Facebook FastText의 한국어 바이너리 모델 파일이 필요합니다.

1. 아래 링크를 통해 공식 압축 파일을 다운로드합니다:
   - **[cc.ko.300.bin.gz 다운로드 (Facebook 공식 링크)](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.bin.gz)**
2. 다운로드가 완료되면 압축을 해제합니다.
3. 압축이 해제된 `cc.ko.300.bin` (약 4.5GB) 파일을 프로젝트 루트의 **`models/`** 폴더 안에 배치해 주세요.
   ```bash
   # 최종 경로 확인
   guessword/models/cc.ko.300.bin
   ```

---

## 🐍 2. 백엔드(Backend) 실행 방법

### 방법 A: Docker Compose 사용 (DevOps 추천 🐳)
도커 환경이 설치되어 있다면 최적화된 컴파일 가이드 및 메모리(8GB) 리소스 제어가 적용된 컨테이너로 즉시 기동이 가능합니다. FastText 로딩 속도를 향상시키기 위해 모델 파일은 호스트 볼륨 마운트로 바인딩됩니다.

```bash
# 1. 백엔드 컨테이너 빌드 및 백그라운드 실행
docker-compose up -d --build

# 2. 서버 실행 상태 및 FastText 모델 로드 로그 확인
docker-compose logs -f
```
- 서버 엔드포인트: `http://localhost:8000`
- API 문서(Swagger): `http://localhost:8000/docs`

### 방법 B: 로컬 파이썬(Python) 직접 가동
```bash
cd backend

# 1. 가상환경 생성 및 활성화
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. 필수 라이브러리 설치 (컴파일 환경 필요)
pip install -r requirements.txt

# 3. 서버 실행
uvicorn app.main:app --reload
```

---

## 🎨 3. 프론트엔드(Frontend) 실행 방법

프론트엔드는 로컬 Node.js 환경에서 구동됩니다.

```bash
cd frontend

# 1. 라이브러리 의존성 패키지 설치
npm install

# 2. 환경 설정 파일 세팅
# 생성된 .env.local 파일에 백엔드 API URL 및 본인의 Firebase 웹 앱 인증 키를 세팅합니다.
# (설정 파일이 없으면 frontend/.env.local 파일을 생성하세요)
```
- **Firebase 연동**: 실시간 랭킹보드(전광판) 및 클리어 저장을 위해 Firebase 콘솔 프로젝트에서 웹 앱을 추가한 후, 해당하는 키들을 `frontend/.env.local` 에 작성해 주세요. (미작성 시 기본 로컬 오프라인 모드로 자동 분기됩니다.)

```bash
# 3. 로컬 개발 서버 기동
npm run dev
```
- 브라우저 접속 주소: `http://localhost:3000`

---

## ⚙️ 게임 룰 & 설정 변경
- **게임 룰**: 단어를 입력하면 0~100점 사이의 점수로 보정되어 표시됩니다. 입력된 단어가 정답 기준 상위 1000위 안에 드는 순간, 글래스 보드 뒤편의 아우라(Glow)가 붉은 주황빛으로 환하게 변하며 점수가 50점 이상으로 대폭 도약합니다.
- **정답 단어 변경 (비밀 관리자 패널)**:
  - 프론트엔드 게임 화면의 우측 상단 제어바 옆에 숨겨진 **미세한 회색 점(`.`)**을 클릭하면 관리자 모달이 열립니다.
  - 새 정답을 입력하고 저장을 누르면 백엔드 사전 유효성 검사(`/api/validate_target`)를 거친 후, 유효한 단어일 때 로컬 세션과 연동되어 새로운 무한 도전이 시작됩니다.
