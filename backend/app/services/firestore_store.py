import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("guessword.firestore")


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
            logger.warning("firebase-admin 패키지가 없어 Firestore 기록 기능을 비활성화합니다.")
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
            logger.info("Firestore Admin SDK 초기화 완료")
        except Exception as exc:
            logger.warning("Firestore Admin SDK 초기화 실패: %s", exc)
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
    ) -> None:
        if not self.enabled:
            return

        safe_nickname = self._safe_string(nickname, "익명", 20)
        safe_ip = self._safe_string(ip, "unknown", 45)
        safe_device = self._safe_string(device, "unknown", 250)

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
            self.client.collection("attempts").add(attempt_payload)

            # 유저의 최신 상태만 머지 (읽기 없이 즉시 쓰기하여 읽기 1회 및 추가 쓰기 2회 절약)
            user_ref = self.client.collection("users").document(safe_nickname)
            user_payload = {
                "nickname": safe_nickname,
                "ip": safe_ip,
                "device": safe_device,
                "lastActive": self.firestore.SERVER_TIMESTAMP,
            }
            user_ref.set(user_payload, merge=True)

            if is_correct:
                self.client.collection("clears").add({
                    "gameId": game_id,
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
            logger.warning("Firestore 기록 저장 실패: %s", exc)

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
            "previousDevice": previous_device if existing else "",
            "currentDevice": current_device,
            "ipChanged": ip_changed,
            "deviceChanged": device_changed,
        })

    def get_global_best_score(self, game_id: str) -> float:
        if not self.enabled:
            return 0

        try:
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
            logger.warning("Firestore 최고 점수 조회 실패: %s", exc)
            return 0

    def get_recent_clears(self, limit: int = 5) -> list[dict[str, Any]]:
        if not self.enabled:
            return []

        try:
            docs = (
                self.client.collection("clears")
                .order_by("timestamp", direction=self.firestore.Query.DESCENDING)
                .limit(max(1, min(limit, 20)))
                .stream()
            )
            return [self._serialize_clear(doc.id, doc.to_dict()) for doc in docs]
        except Exception as exc:
            logger.warning("Firestore 클리어 기록 조회 실패: %s", exc)
            return []

    def _serialize_clear(self, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
        timestamp = data.get("timestamp")
        if hasattr(timestamp, "isoformat"):
            timestamp_value = timestamp.isoformat()
        else:
            timestamp_value = datetime.now(timezone.utc).isoformat()

        return {
            "id": doc_id,
            "gameId": data.get("gameId", ""),
            "attempts": int(data.get("attempts", 0) or 0),
            "timestamp": timestamp_value,
            "nickname": data.get("nickname", "누군가"),
        }

    def get_recent_attempts(self, limit: int = 10) -> list[dict[str, Any]]:
        """최근 시도 기록 조회 (민감 정보 제외: 단어, IP, device 미반환)"""
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
            logger.warning("Firestore 시도 기록 조회 실패: %s", exc)
            return []

    def _serialize_attempt(self, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """시도 기록 직렬화 — 닉네임, 점수, 시간만 노출"""
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
        cleaned = (value or fallback).strip().replace("/", "_")
        if not cleaned:
            cleaned = fallback
        return cleaned[:max_length]
