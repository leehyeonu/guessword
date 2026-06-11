import pytest
from app.api.auth import create_access_token

def test_signup_success(client):
    response = client.post("/api/auth/signup", json={
        "nickname": "new_user_1",
        "password": "securepassword1"
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["nickname"] == "new_user_1"

def test_signup_duplicate(client):
    # existing_user is already populated in conftest.py
    response = client.post("/api/auth/signup", json={
        "nickname": "existing_user",
        "password": "password123"
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "이미 존재하는 닉네임입니다."

def test_signup_validation_errors(client):
    # nickname too short
    response = client.post("/api/auth/signup", json={
        "nickname": "u",
        "password": "password123"
    })
    assert response.status_code == 422
    
    # password too short
    response = client.post("/api/auth/signup", json={
        "nickname": "user_short_pass",
        "password": "123"
    })
    assert response.status_code == 422

def test_login_success(client):
    response = client.post("/api/auth/login", json={
        "nickname": "existing_user",
        "password": "password123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["nickname"] == "existing_user"

def test_login_invalid_password(client):
    response = client.post("/api/auth/login", json={
        "nickname": "existing_user",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "닉네임 또는 비밀번호가 올바르지 않습니다."

def test_login_nonexistent_user(client):
    response = client.post("/api/auth/login", json={
        "nickname": "no_user_here",
        "password": "password123"
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "닉네임 또는 비밀번호가 올바르지 않습니다."

def test_migrate_success_header(client):
    token = create_access_token({"sub": "existing_user"})
    response = client.post(
        "/api/auth/migrate", 
        json={
            "past_sessions": [{"gameId": "game123", "attemptsCount": 5}],
            "anon_nickname": "anon#XYZ1"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

def test_migrate_success_query_fallback(client):
    token = create_access_token({"sub": "existing_user"})
    response = client.post(
        f"/api/auth/migrate?token={token}", 
        json={
            "past_sessions": [],
            "anon_nickname": ""
        }
    )
    assert response.status_code == 200

def test_migrate_unauthorized(client):
    response = client.post(
        "/api/auth/migrate", 
        json={
            "past_sessions": [],
            "anon_nickname": ""
        }
    )
    assert response.status_code == 401

def test_withdraw_success(client):
    # Setup some dummy data in DB collections for existing_user to test anonymization
    store = client.app.state.firestore_store
    store._db["attempts"]["att_existing"] = {"gameId": "game12", "nickname": "existing_user", "word": "사과", "score": 80.0}
    store._db["clears"]["clear_existing"] = {"gameId": "game12", "nickname": "existing_user", "word": "사과"}
    store._db["closest_guesses"]["close_existing"] = {"gameId": "game12", "nickname": "existing_user", "score": 80.0}
    store._db["daily_scores"]["game12"] = {
        "scores": {
            "existing_user": {"nickname": "existing_user", "attempts": 5, "timestamp": "2026-06-12T00:00:00Z"}
        }
    }
    
    # Assert they exist before deletion
    assert "existing_user" in store._db["users"]
    assert store._db["attempts"]["att_existing"]["nickname"] == "existing_user"
    assert store._db["daily_scores"]["game12"]["scores"]["existing_user"]["nickname"] == "existing_user"
    
    token = create_access_token({"sub": "existing_user"})
    response = client.post(
        "/api/auth/withdraw",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    # Verify Hard Delete of profile
    assert "existing_user" not in store._db["users"]
    # Verify Anonymization of history
    assert store._db["attempts"]["att_existing"]["nickname"] == "탈퇴한 사용자"
    assert store._db["clears"]["clear_existing"]["nickname"] == "탈퇴한 사용자"
    assert store._db["closest_guesses"]["close_existing"]["nickname"] == "탈퇴한 사용자"
    assert store._db["daily_scores"]["game12"]["scores"]["existing_user"]["nickname"] == "탈퇴한 사용자"

def test_withdraw_unauthorized(client):
    response = client.post("/api/auth/withdraw")
    assert response.status_code == 401
