import pytest

def test_game_info(client):
    response = client.get("/api/game_info")
    assert response.status_code == 200
    data = response.json()
    assert "game_id" in data
    assert data["round"] == 42
    assert "past_answers" in data
    assert "past_rounds" in data

def test_validate_target_valid(client):
    response = client.post("/api/validate_target", json={
        "target_word": "사과"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["target_word"] == "사과"
    assert data["valid"] is True

def test_validate_target_invalid(client):
    response = client.post("/api/validate_target", json={
        "target_word": "사과의의" # Not in mock vocab
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False

def test_validate_target_too_long(client):
    response = client.post("/api/validate_target", json={
        "target_word": "사" * 31
    })
    # Pydantic schema validation returns 422 Unprocessable Entity
    assert response.status_code == 422

def test_guess_success_incorrect(client):
    # '바나나' is in mock vocab, not target ('정답')
    response = client.post("/api/guess", json={
        "guess_word": "바나나",
        "nickname": "테스터",
        "attempt_count": 3
    })
    assert response.status_code == 200
    data = response.json()
    assert data["guess_word"] == "바나나"
    assert data["is_correct"] is False
    assert data["score"] == 45.0
    assert data["similarity"] == 0.45

def test_guess_success_correct(client):
    # '정답' is target
    response = client.post("/api/guess", json={
        "guess_word": "정답",
        "nickname": "테스터",
        "attempt_count": 5
    })
    assert response.status_code == 200
    data = response.json()
    assert data["guess_word"] == "정답"
    assert data["is_correct"] is True
    assert data["score"] == 100.0
    assert data["similarity"] == 1.0
    assert data["target_word"] == "정답"

def test_guess_oov(client):
    response = client.post("/api/guess", json={
        "guess_word": "외계어", # Not in mock vocab
        "nickname": "테스터",
        "attempt_count": 1
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "사전에 없는 단어입니다."

def test_guess_too_long(client):
    response = client.post("/api/guess", json={
        "guess_word": "사" * 31,
        "nickname": "테스터",
        "attempt_count": 1
    })
    # Pydantic schema validation returns 422 Unprocessable Entity
    assert response.status_code == 422

def test_game_stats(client):
    response = client.get("/api/game_stats?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "global_best_score" in data
    assert "recent_attempts" in data
    assert isinstance(data["recent_attempts"], list)
