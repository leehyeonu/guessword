import sys
import os
import logging
# Set environment variables BEFORE any app imports are collected by pytest
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret_key_12345_secure_must_be_long"
os.environ["GAME_ID_SALT"] = "test_salt_123"

import pytest
import uuid
from unittest.mock import MagicMock, patch

# ==============================================================================
# In-Memory Firestore Mock Implementation
# ==============================================================================

class MockDocumentSnapshot:
    def __init__(self, doc_id, data, collection_name=None, store=None):
        self.id = doc_id
        self._data = data
        self.exists = data is not None
        self.collection_name = collection_name
        self.store = store

    @property
    def reference(self):
        return MockDocumentReference(self.collection_name, self.id, self.store)

    def to_dict(self):
        return self._data

class MockDocumentReference:
    def __init__(self, collection_name, doc_id, store):
        self.collection_name = collection_name
        self.id = doc_id
        self.store = store

    @property
    def reference(self):
        return self

    def get(self, transaction=None):
        coll_dict = self.store._get_nested_dict(self.collection_name)
        data = coll_dict.get(self.id)
        return MockDocumentSnapshot(self.id, data, self.collection_name, self.store)

    def set(self, data, merge=False, transaction=None):
        coll_dict = self.store._get_nested_dict(self.collection_name, create=True)
        if merge and self.id in coll_dict:
            coll_dict[self.id].update(data)
        else:
            coll_dict[self.id] = data

    def update(self, data, transaction=None):
        coll_dict = self.store._get_nested_dict(self.collection_name, create=True)
        if self.id not in coll_dict:
            coll_dict[self.id] = {}
        coll_dict[self.id].update(data)

    def delete(self):
        coll_dict = self.store._get_nested_dict(self.collection_name)
        if self.id in coll_dict:
            del coll_dict[self.id]

class MockQuery:
    def __init__(self, collection_ref, filters=None):
        self.collection_ref = collection_ref
        self.filters = filters or []
        self._limit = None

    def where(self, filter=None, **kwargs):
        if filter:
            self.filters.append(filter)
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, num):
        self._limit = num
        return self

    def stream(self):
        store = self.collection_ref.store
        docs = []
        coll_data = store._get_nested_dict(self.collection_ref.name)
        for doc_id, data in coll_data.items():
            match = True
            for f in self.filters:
                if f and hasattr(f, "field_path"):
                    val = data.get(f.field_path)
                    if f.op_string == "==":
                        if val != f.value:
                            match = False
                            break
            if match:
                docs.append(MockDocumentSnapshot(doc_id, data, self.collection_ref.name, store))
        if self._limit:
            docs = docs[:self._limit]
        return docs

class MockCollectionReference:
    def __init__(self, name, store):
        self.name = name
        self.store = store

    def document(self, doc_id):
        return MockDocumentReference(self.name, doc_id, self.store)

    def add(self, data):
        doc_id = str(uuid.uuid4())
        coll_dict = self.store._get_nested_dict(self.name, create=True)
        coll_dict[doc_id] = data
        return None, MockDocumentReference(self.name, doc_id, self.store)

    def where(self, filter=None, **kwargs):
        q = MockQuery(self)
        return q.where(filter=filter)

    def order_by(self, *args, **kwargs):
        return MockQuery(self).order_by(*args, **kwargs)

    def limit(self, num):
        return MockQuery(self).limit(num)

    def stream(self):
        return MockQuery(self).stream()

class MockTransaction:
    def get(self, ref):
        return ref.get()

    def set(self, ref, data):
        ref.set(data)

    def update(self, ref, data):
        ref.update(data)

    def delete(self, ref):
        ref.delete()

class MockBatch:
    def __init__(self, store):
        self.store = store
        self.actions = []

    def update(self, ref, data):
        self.actions.append(lambda: ref.update(data))

    def delete(self, ref):
        self.actions.append(lambda: ref.delete())

    def commit(self):
        for act in self.actions:
            act()
        self.actions = []

class MockFieldFilter:
    def __init__(self, field_path, op_string, value):
        self.field_path = field_path
        self.op_string = op_string
        self.value = value

# ==============================================================================
# Mock Firestore Store Class
# ==============================================================================

class MockFirestoreStore:
    def __init__(self, *args, **kwargs):
        self.enabled = True
        self.client = self
        self.firestore = self
        
        # In-memory DB with support for slashes (nested dicts)
        self._db = {
            "users": {},
            "attempts": {},
            "clears": {},
            "closest_guesses": {},
            "daily_scores": {}
        }
        
        # Prepopulate existing_user for login/withdrawal testing
        import bcrypt
        hashed = bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        self._db["users"]["existing_user"] = {
            "nickname": "existing_user",
            "password_hash": hashed,
            "total_wins": 3,
            "total_attempts_played": 15
        }

    def _get_nested_dict(self, path: str, create: bool = False) -> dict:
        parts = path.strip("/").split("/")
        curr = self._db
        for p in parts:
            if p not in curr:
                if create:
                    curr[p] = {}
                else:
                    return {}
            curr = curr[p]
            if not isinstance(curr, dict):
                return {}
        return curr

    # Firestore Client methods Mocking
    def collection(self, name):
        return MockCollectionReference(name, self)

    def collection_group(self, name):
        class MockCollectionGroupReference:
            def __init__(self, name, store):
                self.name = name
                self.store = store
                
            def where(self, filter=None, **kwargs):
                docs = []
                for game_id, game_data in self.store._db.get("daily_scores", {}).items():
                    scores_dict = game_data.get("scores", {})
                    for doc_id, data in scores_dict.items():
                        match = True
                        if filter:
                            val = data.get(filter.field_path)
                            if filter.op_string == "==":
                                if val != filter.value:
                                    match = False
                        if match:
                            docs.append(MockDocumentSnapshot(doc_id, data, f"daily_scores/{game_id}/scores", self.store))
                
                class MockGroupQuery:
                    def stream(self):
                        return docs
                return MockGroupQuery()
        return MockCollectionGroupReference(name, self)

    def transaction(self):
        return MockTransaction()

    def batch(self):
        return MockBatch(self)

    @property
    def Query(self):
        class MockQueryOptions:
            DESCENDING = "DESCENDING"
        return MockQueryOptions()

    SERVER_TIMESTAMP = "SERVER_TIMESTAMP"

    # Business logical methods
    def log_guess(self, **kwargs):
        nickname = kwargs.get("nickname", "익명")
        game_id = kwargs.get("game_id", "mock_game")
        
        attempt_data = {
            "gameId": game_id,
            "nickname": nickname,
            "word": kwargs.get("word", ""),
            "similarity": kwargs.get("similarity", 0.0),
            "score": kwargs.get("score", 0.0),
            "timestamp": "SERVER_TIMESTAMP",
            "ip": kwargs.get("ip", "unknown"),
            "device": kwargs.get("device", "unknown")
        }
        if "attempts" not in self._db:
            self._db["attempts"] = {}
        self._db["attempts"][str(uuid.uuid4())] = attempt_data

        # Update lastActive in users
        if "users" not in self._db:
            self._db["users"] = {}
        if nickname not in self._db["users"]:
            self._db["users"][nickname] = {
                "nickname": nickname,
                "total_wins": 0,
                "total_attempts_played": 0
            }
        self._db["users"][nickname].update({
            "ip": kwargs.get("ip", "unknown"),
            "device": kwargs.get("device", "unknown")
        })

        if kwargs.get("is_correct"):
            if "clears" not in self._db:
                self._db["clears"] = {}
            self._db["clears"][str(uuid.uuid4())] = {
                "gameId": game_id,
                "word": kwargs.get("word", ""),
                "attempts": kwargs.get("attempt_count", 1),
                "nickname": nickname
            }
        elif kwargs.get("score") >= 10:
            if "closest_guesses" not in self._db:
                self._db["closest_guesses"] = {}
            self._db["closest_guesses"][str(uuid.uuid4())] = {
                "gameId": game_id,
                "score": kwargs.get("score", 0.0),
                "nickname": nickname
            }

    def get_global_best_score(self, game_id: str) -> float:
        return 95.0

    def get_recent_attempts(self, limit: int = 10):
        attempts = []
        for att_id, data in self._db.get("attempts", {}).items():
            attempts.append({
                "id": att_id,
                "nickname": data.get("nickname", "익명"),
                "score": data.get("score", 0.0),
                "timestamp": "2026-06-12T00:00:00Z"
            })
        if not attempts:
            return [
                {"id": "att_1", "nickname": "테스터", "score": 85.5, "timestamp": "2026-06-12T00:00:00Z"},
                {"id": "att_2", "nickname": "탈퇴한 사용자", "score": 95.0, "timestamp": "2026-06-12T00:01:00Z"}
            ]
        return attempts[:limit]

    def close(self):
        pass

# ==============================================================================
# Mock FastText Wrapper
# ==============================================================================

class MockFastTextWrapper:
    def __init__(self, model_path=None):
        pass

    def is_word_in_vocab(self, word: str) -> bool:
        return word in ["사과", "바나나", "정답", "테스트", "나무", "강아지", "고양이", "말맞춤"]

    def calculate_score(self, target: str, guess: str):
        if target == guess:
            return 1.0, 100.0
        return 0.45, 45.0

# ==============================================================================
# Override Class definitions in app modules
# ==============================================================================

import app.services.firestore_store
app.services.firestore_store.FirestoreStore = MockFirestoreStore

import app.services.nlp
app.services.nlp.FastTextWrapper = MockFastTextWrapper

# Mock google cloud firestore classes if needed
import google.cloud.firestore
google.cloud.firestore.FieldFilter = MockFieldFilter
import google.cloud.firestore_v1
google.cloud.firestore_v1.FieldFilter = MockFieldFilter

# ==============================================================================
# Pytest Fixtures
# ==============================================================================

from fastapi.testclient import TestClient

@pytest.fixture(scope="session", autouse=True)
def mock_daily_word_system():
    """daily_word 모듈의 무거운 Firestore 및 외부 조회 차단"""
    import app.services.daily_word as dw
    
    dw._cached_words = ["사과", "바나나", "정답", "테스트", "나무"]
    dw._cached_daily_word = "정답"
    dw._cached_daily_word_round = 42
    
    # monkeypatch daily_word functions
    dw.get_daily_target_word = lambda: "정답"
    dw.get_daily_target_round = lambda: 42
    dw.get_game_id = lambda w: "mock_game_id_hash_12345"
    dw.get_past_answers = lambda: {"1": "사과", "2": "바나나"}
    dw.get_past_rounds = lambda: {"사과": 1, "바나나": 2}
    dw.rotate_target_word = lambda solved: "테스트"

@pytest.fixture(autouse=True)
def inject_pytest_log_filters():
    """pytest가 동적으로 추가하는 모든 log capture handler에 RequestIDFilter 주입"""
    from app.main import RequestIDFilter, formatter
    root_logger = logging.getLogger()
    for h in root_logger.handlers:
        if not any(isinstance(f, RequestIDFilter) for f in h.filters):
            h.addFilter(RequestIDFilter())
            h.setFormatter(formatter)

@pytest.fixture(scope="module")
def client():
    # Disable rate limiter for pytest integration tests to prevent 429
    from app.api.game import limiter
    limiter.enabled = False
    
    # Import app inside client fixture to ensure patches are fully active
    from app.main import app
    
    # Overwrite the background load thread so it doesn't run during testing
    with patch("app.main.load_model_background", lambda app, path: None):
        with TestClient(app) as test_client:
            # Inject mocked store and wrapper directly into app.state
            test_client.app.state.firestore_store = MockFirestoreStore()
            test_client.app.state.nlp_wrapper = MockFastTextWrapper()
            yield test_client
