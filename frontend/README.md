# K-Semantle Frontend (Next.js)

K-Semantle 게임의 React/Next.js 기반 프론트엔드 앱입니다.

## 로컬 실행 방법

1. 의존성 설치:
   ```bash
   npm install
   ```

2. `.env.local` 세팅:
   로컬 개발 시 백엔드 주소와 Firebase 키 설정을 위해 루트에 `.env.local` 파일을 만들고 채워주세요. (없는 경우 오프라인 모드로 실행됨)
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   
   # Firebase 관련 (선택)
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   ```

3. 개발 서버 구동:
   ```bash
   npm run dev
   ```
   `http://localhost:3000`으로 브라우저에서 확인할 수 있습니다.
