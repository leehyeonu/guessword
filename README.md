# 🎮 말맞춤 (MalMatch)

<div align="center">
  <img src="frontend/src/app/icon.svg" width="100" height="100" alt="MalMatch Logo" />
  <h3>유사도 기반 실시간 단어 추측 웹 게임</h3>
  <p>AI 임베딩 기술을 적용해 숨겨진 오늘의 정답 단어를 실시간으로 추론해내는 모던 두뇌 퀴즈 플랫폼입니다.</p>

[![Next.js](https://img.shields.io/badge/Next.js-16.2.7-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
</div>

---

## 🏛️ 시스템 아키텍처 (System Architecture)

말맞춤은 클라이언트 측의 개인정보 노출 및 크레덴셜 오염을 최소화하고, 서버 리소스 사용량 및 지연율을 보장하기 위해 **헤드리스 백엔드 은닉 프록시** 패턴을 준수합니다.

```mermaid
sequenceDiagram
    autonumber
    actor User as 클라이언트 (브라우저)
    participant NextProxy as Next.js API 프록시 (Vercel)
    participant Backend as FastAPI 백엔드 (Hugging Face)
    database Firestore as Firebase Firestore

    User->>NextProxy: 1. 단어 제출 (/api/guess) + JWT 헤더
    activate NextProxy
    Note over NextProxy: Request ID (Trace ID) 바인딩 및 전파
    NextProxy->>Backend: 2. 중계 요청 (/api/guess) + 내부 API 토큰 주입
    activate Backend
    Note over Backend: FastText 유사도 모델 연산 (O(1) 캐싱 참조)
    Backend->>Firestore: 3. 시도 기록 적재 & 유저 정보 업데이트
    Backend-->>NextProxy: 4. 스코어 결과 반환
    deactivate Backend
    NextProxy-->>User: 5. 최종 유사도 응답 (X-Request-ID 포함)
    deactivate NextProxy
```

---

## 📂 프로젝트 구조 (Directory Structure)

프로젝트는 모던 모노레포 아키텍처 가이드라인에 맞추어 백엔드(FastAPI)와 프론트엔드(Next.js App Router)로 엄격히 관심사 분리되어 있습니다.

```text
guessword/
├── backend/                  # FastAPI 백엔드 애플리케이션 코어
│   ├── app/
│   │   ├── api/              # API 엔드포인트 모듈 (인증, 게임 비즈니스, 리더보드)
│   │   ├── data/             # AES 암호화된 오늘의 단어 사전 데이터셋 (words.enc)
│   │   └── services/         # 도메인 서비스 핵심 로직 (FastText NLP, DB 래퍼)
│   ├── scripts/              # 단어 암호화 및 사전 관리 헬퍼 스크립트
│   ├── tests/                # Pytest 기반 백엔드 API & DB 모킹 검증 테스트 스위트
│   ├── Dockerfile            # Multi-stage 기반 경량 컨테이너 명세서
│   └── requirements.txt      # 파이썬 의존성 패키지 명세
├── frontend/                 # Next.js 프론트엔드 애플리케이션
│   ├── src/
│   │   ├── app/              # Next.js App Router (페이지 컴포넌트, 프록시 라우트)
│   │   ├── components/       # UI 컴포넌트 단위 (Atomic Elements & Modals)
│   │   └── lib/              # 공용 API 클라이언트 및 유틸리티 헬퍼 모듈
│   ├── vitest.config.ts      # Vitest 러너 구성 파일
│   ├── vitest.setup.ts       # JSDOM 테스팅 라이브러리 및 Framer Motion 모킹 셋업
│   └── package.json          # Node.js 의존성 패키지 및 스크립트 명세
├── models/                   # 4.5GB 오프라인 FastText 한국어 사전 임베딩 바이너리
├── deploy.sh                 # 원클릭 배포 쉘 스크립트
└── docker-compose.yml        # 로컬 컨테이너 통합 가동 설정
```

---

## ✨ 핵심 기능 및 기술 하이라이트

### 1. AI 단어 유사도 연산 및 로그 캐싱
*   **FastText 한국어 임베딩**: 페이스북의 `cc.ko.300.bin` 모델을 로드하여 입력 단어 간 코사인 유사도를 정교하게 비교합니다.
*   **$O(1)$ 연산 최적화**: 잦은 L2 Norm 연산 병목을 제거하기 위해 정답 단어 벡터 캐싱 및 Top 1000 이웃 탐색 순위를 메모리에 전역 캐싱하여 동시 트래픽 반응 속도를 극대화했습니다.

### 2. GDPR/개인정보보호 및 분산 추적(Observability)
*   **PII 데이터 마스킹**: 브라우저 핑거프린팅 위협을 무력화하기 위해 User-Agent에서 OS와 브라우저 카테고리 정보만을 추출해 마스킹(`_mask_user_agent`) 저장합니다.
*   **Hard Delete & Anonymization 결합 탈퇴**: 탈퇴 처리 시 사용자 프로필 문서는 물리 삭제하고, 기록 유실에 의한 리더보드 왜곡을 방지하기 위해 사용자의 모든 게임 시도 내역 닉네임은 `"탈퇴한 사용자"`로 치환 연동을 단방향 파괴 처리합니다.
*   **분산 Request ID 추적**: Next.js 프록시 계층부터 FastAPI 코어까지 `X-Request-ID` 컨텍스트를 바인딩하여 장애 발생 시 유기적인 트레이싱 로그를 보장합니다.

### 3. 무손실 입력 격리 및 레이아웃 흔들림(CLS) 차단
*   **인풋 렌더 트리 분리**: 실시간 타이핑 시 발생하는 대규모 리렌더링 전파를 차단하기 위해 입력 폼(`GuessForm`)을 단독 격리 컴포넌트로 분리하여 인풋 지연(Typing Lag) 현상을 원천 방지했습니다.
*   **로딩 스켈레톤 UI**: 데이터 Fetching 지연 시간 동안 레이아웃이 급격히 무너지는 현상을 막기 위해 리더보드와 최근 시도 컴포넌트에 스켈레톤 디자인을 적용, 누적 레이아웃 이동(CLS) 스코어를 최소화했습니다.

---

## 🚀 로컬 실행 방법 (Getting Started)

### 사전 필수 요구사항 (Prerequisites)
유사도 측정을 위해 오프라인 한국어 FastText 임베딩 모델 바이너리가 필요합니다.
1. **[cc.ko.300.bin.gz 다운로드](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.bin.gz)** 링크에서 모델 압축파일을 받습니다.
2. 압축 해제 후 생성된 `cc.ko.300.bin` (약 7.2GB) 파일을 프로젝트 루트 하위 `models/` 디렉토리에 넣어주세요.
   ```bash
   # 최종 모델 배치 위치
   guessword/models/cc.ko.300.bin
   ```

---

### 방법 A. Docker Compose 통합 가동 (권장)
로컬에 Docker 환경이 준비되어 있다면 아래 한 줄의 명령어로 전체 서비스를 즉시 올릴 수 있습니다.
```bash
# 컨테이너 빌드 및 백그라운드 구동
docker-compose up -d --build

# 실시간 컨테이너 로깅 확인
docker-compose logs -f
```
*   **프론트엔드 접속**: `http://localhost:3000`
*   **백엔드 API 및 Swagger**: `http://localhost:8000/docs`

---

### 방법 B. 로컬 개별 실행 (Manual Development Setup)

#### 1. Backend (FastAPI) 구동
```bash
cd backend

# 가상환경 생성 및 활성화
python3 -m venv venv
source venv/bin/activate

# 의존성 패키지 설치
pip install -r requirements.txt

# 설정 템플릿 복사 후 로컬 값 입력 (.env 설정)
cp .env.example .env

# Uvicorn 서버 실행
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend (Next.js) 구동
```bash
cd frontend

# 환경변수 템플릿 설정 복사
cp .env.example .env.local

# 의존성 패키지 설치
npm install

# 로컬 개발 서버 기동
npm run dev
```

---

## 🧪 자동화 테스트 실행 가이드 (Testing)

### 백엔드 테스트 (Pytest)
Firestore 인-메모리 목업 및 FastText NLP 단어 스코어링 모조 객체를 탑재해 외부 네트워크/데이터베이스 의존성 없이 즉각적으로 비즈니스 로직을 검증합니다.
```bash
cd backend
source venv/bin/activate
python3 -m pytest tests/
```

### 프론트엔드 테스트 (Vitest + React Testing Library)
JSDOM 브라우저 환경에서 유저 상호작용 및 회원 탈퇴 이중 잠금 가드 등 클라이언트 핵심 로직을 검증합니다.
```bash
cd frontend
npm run test
```
