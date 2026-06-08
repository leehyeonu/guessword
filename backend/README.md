---
title: guessword
emoji: 🎮
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# GuessKorean Backend

FastAPI와 FastText 한국어 사전 모델로 동작하는 단어 추측 게임(GuessKorean)의 백엔드 서비스입니다.

## Firestore Admin 설정

Firestore 기록은 브라우저가 아니라 백엔드의 Firebase Admin SDK로만 저장/조회합니다.

운영 환경에는 아래 방식 중 하나로 Firebase 서비스 계정 인증을 설정하세요.

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
GAME_ID_SALT=long-random-secret
```

또는:

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

인증 정보가 없으면 API 서버는 계속 실행되지만 Firestore 기록/조회 기능은 비활성화됩니다.
