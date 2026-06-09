# K-Semantle Frontend (Next.js)

K-Semantle 게임의 React/Next.js 기반 프론트엔드 앱입니다.

## 로컬 실행 방법

1. 의존성 설치:
   ```bash
   npm install
   ```

2. `.env.local` 세팅:
   로컬 개발 시 백엔드 주소 설정을 위해 루트에 `.env.local` 파일을 만들고 채워주세요.
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. 개발 서버 구동:
   ```bash
   npm run dev
   ```
   `http://localhost:3000`으로 브라우저에서 확인할 수 있습니다.

## 프로덕션 배포 (Vercel)

Vercel에 배포할 때는 다음 환경변수를 설정합니다:

| 변수명 | 설명 |
|--------|------|
| `HF_API_URL` | Private HF Space 백엔드 URL |
| `HF_TOKEN` | Hugging Face 액세스 토큰 |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase 클라이언트 키 (6개) |

> ⚠️ Vercel에서는 `NEXT_PUBLIC_API_URL`을 설정하지 마세요. 프록시를 우회하여 404 오류가 발생합니다.

## 주요 구조

- `src/app/page.tsx` — 메인 게임 페이지
- `src/app/api/[...path]/route.ts` — 백엔드 프록시 (HF_TOKEN 자동 주입)
- `src/components/` — UI 컴포넌트 (AuthModal, LeaderboardTicker, TutorialModal 등)
