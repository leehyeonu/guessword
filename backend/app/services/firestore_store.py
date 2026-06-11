import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("malmatch.firestore")


class FirestoreStore:
    def __init__(self):
        self.client = None
        self.firestore = None
        self.FieldFilter = None
        self._init_client()

    @property
    def enabled(self) -> bool:
        return self.client is not None and self.firestore is not None

    def _init_client(self) -> None:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
            from google.cloud.firestore_v1.base_query import FieldFilter
        except ImportError:
            logger.warning("⚠️ [SYSTEM] firebase-admin 패키지가 없어 Firestore 기록 기능을 비활성화합니다.")
            return

        try:
            app_options: dict[str, str] = {}
            project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
            if project_id:
                app_options["projectId"] = project_id

            credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
            credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

            try:
                app = firebase_admin.get_app()
            except ValueError:
                if credentials_json:
                    cred = credentials.Certificate(json.loads(credentials_json))
                elif credentials_path:
                    cred = credentials.Certificate(credentials_path)
                else:
                    cred = credentials.ApplicationDefault()

                app = firebase_admin.initialize_app(cred, app_options or None)

            self.firestore = firestore
            self.FieldFilter = FieldFilter
            self.client = firestore.client(app)
            logger.info("🚀 [SYSTEM] Firestore Admin SDK 초기화 완료")
        except Exception as exc:
            logger.warning("❌ [SYSTEM] Firestore Admin SDK 초기화 실패: %s", exc)
            self.client = None
            self.firestore = None

    def log_guess(
        self,
        *,
        game_id: str,
        nickname: str,
        word: str,
        similarity: float,
        score: float,
        is_correct: bool,
        attempt_count: int,
        ip: str,
        device: str,
        round_val: int = 1,
    ) -> None:
        """인게임 유저 추측 기록 및 통계 데이터 Firestore 저장"""
        if not self.enabled:
            return

        safe_nickname = self._safe_string(nickname, "익명", 20)
        safe_ip = self._safe_string(ip, "unknown", 45)
        # 브라우저 핑거프린팅 식별 방지를 위해 User-Agent 마스킹 필터 적용
        safe_device = self._mask_user_agent(device)

        attempt_payload = {
            "gameId": game_id,
            "nickname": safe_nickname,
            "word": self._safe_string(word, "", 30),
            "similarity": float(similarity),
            "score": float(score),
            "timestamp": self.firestore.SERVER_TIMESTAMP,
            "ip": safe_ip,
            "device": safe_device,
        }

        try:
            logger.info(f"💾 [DB_WRITE] Firestore에 '{safe_nickname}' 사용자의 시도 기록 저장 (단어: '{attempt_payload['word']}')")
            self.client.collection("attempts").add(attempt_payload)

            # 유저 최근 접속 일시 및 디바이스 정보 실시간 갱신
            user_ref = self.client.collection("users").document(safe_nickname)
            user_payload = {
                "nickname": safe_nickname,
                "ip": safe_ip,
                "device": safe_device,
                "lastActive": self.firestore.SERVER_TIMESTAMP,
            }
            logger.debug(f"💾 [DB_WRITE] Firestore 유저 정보 업데이트 ('{safe_nickname}')")
            user_ref.set(user_payload, merge=True)

            # 정답 및 최고 점수 통계 데이터베이스 분기 적재
            if is_correct:
                self.client.collection("clears").add({
                    "gameId": game_id,
                    "word": self._safe_string(word, "", 30),
                    "round": int(round_val),
                    "attempts": max(1, int(attempt_count)),
                    "timestamp": self.firestore.SERVER_TIMESTAMP,
                    "nickname": safe_nickname,
                })
            elif score >= 10:
                self.client.collection("closest_guesses").add({
                    "gameId": game_id,
                    "score": float(score),
                    "timestamp": self.firestore.SERVER_TIMESTAMP,
                    "nickname": safe_nickname,
                })
        except Exception as exc:
            logger.warning("❌ [DB_ERROR] Firestore 기록 저장 실패: %s", exc)

    def _log_identity_event(
        self,
        *,
        user_ref,
        existing: bool,
        previous_ip: str,
        previous_device: str,
        current_ip: str,
        current_device: str,
    ) -> None:
        """접속 기기 정보 또는 IP 변경 감지 시 보안 감사 이벤트 로깅"""
        ip_changed = existing and previous_ip != current_ip
        device_changed = existing and previous_device != current_device

        if existing and not ip_changed and not device_changed:
            return

        event_type = "created" if not existing else "changed"
        user_ref.collection("identity_events").add({
            "type": event_type,
            "timestamp": self.firestore.SERVER_TIMESTAMP,
            "previousIp": previous_ip if existing else "",
            "currentIp": current_ip,
            "previousDevice": self._mask_user_agent(previous_device) if existing else "",
            "currentDevice": self._mask_user_agent(current_device),
            "ipChanged": ip_changed,
            "deviceChanged": device_changed,
        })

    def get_global_best_score(self, game_id: str) -> float:
        """해당 회차 게임의 글로벌 최고 유사도 점수 조회"""
        if not self.enabled:
            return 0

        try:
            logger.info(f"🔍 [DB_READ] Firestore 글로벌 최고 점수 조회 (Game ID: {game_id})")
            docs = (
                self.client.collection("closest_guesses")
                .where(filter=self.FieldFilter("gameId", "==", game_id))
                .order_by("score", direction=self.firestore.Query.DESCENDING)
                .limit(1)
                .stream()
            )
            for doc in docs:
                return float(doc.to_dict().get("score", 0))
            return 0
        except Exception as exc:
            if "requires an index" in str(exc):
                logger.warning(f"⚠️ [DB_ERROR] Firestore 'closest_guesses' 컬렉션의 복합 인덱스가 필요합니다.\n🔥 아래 링크를 브라우저에 붙여넣어 인덱스를 생성해주세요:\n{exc}")
            else:
                logger.warning("❌ [DB_ERROR] Firestore 최고 점수 조회 실패: %s", exc)
            return 0

    def get_recent_attempts(self, limit: int = 10) -> list[dict[str, Any]]:
        """실시간 전광판용 최근 시도 이력 조회 (개인정보 보호를 위해 단어/IP/UA는 응답에서 배제)"""
        if not self.enabled:
            return []

        try:
            docs = (
                self.client.collection("attempts")
                .order_by("timestamp", direction=self.firestore.Query.DESCENDING)
                .limit(max(1, min(limit, 20)))
                .stream()
            )
            return [self._serialize_attempt(doc.id, doc.to_dict()) for doc in docs]
        except Exception as exc:
            logger.warning("❌ [DB_ERROR] Firestore 시도 기록 조회 실패: %s", exc)
            return []

    def _serialize_attempt(self, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """시도 이력 데이터 직렬화 포맷터"""
        timestamp = data.get("timestamp")
        if hasattr(timestamp, "isoformat"):
            timestamp_value = timestamp.isoformat()
        else:
            timestamp_value = datetime.now(timezone.utc).isoformat()

        return {
            "id": doc_id,
            "nickname": data.get("nickname", "누군가"),
            "score": float(data.get("score", 0) or 0),
            "timestamp": timestamp_value,
        }

    def _safe_string(self, value: str, fallback: str, max_length: int) -> str:
        """입력 문자열 길이제한 가드 및 특수문자 정화 필터"""
        cleaned = (value or fallback).strip().replace("/", "_")
        if not cleaned:
            cleaned = fallback
        return cleaned[:max_length]

    def _mask_user_agent(self, ua: str) -> str:
        """기기 식별자 유출 방지를 위한 User-Agent 마스킹 (OS/브라우저 유형만 매핑)"""
        if not ua or ua == "unknown":
            return "unknown"
        ua_lower = ua.lower()
        
        # 운영체제 분류
        os_name = "Other OS"
        if "windows" in ua_lower:
            os_name = "Windows"
        elif "macintosh" in ua_lower or "mac os" in ua_lower:
            os_name = "macOS"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            os_name = "iOS"
        elif "android" in ua_lower:
            os_name = "Android"
        elif "linux" in ua_lower:
            os_name = "Linux"

        # 브라우저 분류
        browser_name = "Other Browser"
        if "chrome" in ua_lower or "crios" in ua_lower:
            browser_name = "Chrome"
        elif "safari" in ua_lower:
            browser_name = "Safari"
        elif "firefox" in ua_lower:
            browser_name = "Firefox"
        elif "edge" in ua_lower or "edg" in ua_lower:
            browser_name = "Edge"
            
        return f"{os_name} / {browser_name}"

    def close(self) -> None:
        """서버 종료 시 Lifespan 트리거를 받아 Firestore 연결 세션을 리소스에서 반환"""
        if self.client:
            try:
                self.client.close()
                logger.info("🛑 [SYSTEM] Firestore 클라이언트 세션이 안전하게 종료되었습니다.")
            except Exception as exc:
                logger.warning("⚠️ [SYSTEM] Firestore 클라이언트 세션 종료 중 예외 발생: %s", exc)
