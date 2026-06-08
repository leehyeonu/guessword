import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore } from "firebase/firestore";

// 환경변수가 없으면 오프라인 모드로 돌아가도록 mock 키 세팅
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock-api-key-value",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mock-auth-domain.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mock-project-id",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "mock-storage-bucket.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789000",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789000:web:mockappid12345",
};

// Next.js SSR 대응 및 중복 초기화 방지
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let db: Firestore;
if (getApps().length > 0) {
  db = getFirestore(app);
} else {
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });
}

export { app, db };
