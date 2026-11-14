import pytest
from fastapi.testclient import TestClient

from app import app
from routes.api_management.api_management import profiles_db, usage_stats
from services.api_service import api_service


client = TestClient(app)
PROFILE_URL = "/api/api-management/profiles"


def profile_payload(**overrides):
    profile = {
        "name": "Test Replicate Profile",
        "api_key": "r8_" + "a" * 61,
        "api_type": "replicate",
        "is_active": True,
        "models": ["stable-diffusion", "whisper"],
        "default_model": "stable-diffusion",
        "rate_limit": 60,
    }
    profile.update(overrides)
    return profile


@pytest.fixture(autouse=True)
def clear_profile_state():
    profiles_db.clear()
    usage_stats.clear()
    yield
    profiles_db.clear()
    usage_stats.clear()


@pytest.fixture
def profile_id():
    response = client.post(PROFILE_URL, json=profile_payload())
    assert response.status_code == 200
    return response.json()["id"]


def test_get_providers():
    response = client.get("/api/api-management/providers")

    assert response.status_code == 200
    providers = response.json()["providers"]
    assert {provider["id"] for provider in providers} == {
        "replicate",
        "runpod",
        "openai",
    }


def test_get_profiles_starts_empty():
    response = client.get(PROFILE_URL)

    assert response.status_code == 200
    assert response.json() == {"profiles": []}


def test_create_profile():
    payload = profile_payload()

    response = client.post(PROFILE_URL, json=payload)

    assert response.status_code == 200
    created = response.json()
    assert created["id"]
    assert created["name"] == payload["name"]
    assert created["api_type"] == payload["api_type"]
    assert created["is_active"] is True
    assert created["models"] == payload["models"]


def test_create_profile_rejects_invalid_api_key():
    response = client.post(
        PROFILE_URL,
        json=profile_payload(api_key="invalid_key"),
    )

    assert response.status_code == 400
    assert "must start with 'r8_'" in response.json()["error"]["detail"]


def test_create_profile_rejects_unavailable_model():
    response = client.post(
        PROFILE_URL,
        json=profile_payload(models=["invalid_model"]),
    )

    assert response.status_code == 400
    assert "invalid_model" in response.json()["error"]["detail"]


def test_get_profile(profile_id):
    response = client.get(f"{PROFILE_URL}/{profile_id}")

    assert response.status_code == 200
    assert response.json()["id"] == profile_id
    assert response.json()["name"] == "Test Replicate Profile"


def test_update_profile(profile_id):
    response = client.put(
        f"{PROFILE_URL}/{profile_id}",
        json={"name": "Updated Profile Name", "rate_limit": 100},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Updated Profile Name"
    assert updated["rate_limit"] == 100


def test_delete_profile_requires_deactivation(profile_id):
    response = client.delete(f"{PROFILE_URL}/{profile_id}")
    assert response.status_code == 400

    deactivate_response = client.put(
        f"{PROFILE_URL}/{profile_id}",
        json={"is_active": False},
    )
    assert deactivate_response.status_code == 200

    delete_response = client.delete(f"{PROFILE_URL}/{profile_id}")
    assert delete_response.status_code == 200
    assert "deleted" in delete_response.json()["message"]


def test_provider_models_include_model_type():
    response = client.get("/api/api-management/providers/replicate/models")

    assert response.status_code == 200
    data = response.json()
    assert data["api_type"] == "replicate"
    assert data["models"]
    assert all({"id", "name", "type"} <= model.keys() for model in data["models"])


def test_generation_endpoints_use_selected_profile(profile_id, monkeypatch):
    async def fake_generation_request(**kwargs):
        assert kwargs["profile_id"] == profile_id
        assert kwargs["generation_type"] == "image"
        return {
            "id": "test-generation",
            "status": "completed",
            "result": "test-result",
        }

    monkeypatch.setattr(api_service, "make_generation_request", fake_generation_request)

    response = client.post(
        "/api/generation/generate",
        json={
            "prompt": "A beautiful landscape",
            "model": "stable-diffusion",
            "api_profile_id": profile_id,
            "generation_type": "image",
        },
    )

    assert response.status_code == 200
    generated = response.json()
    assert generated["id"] == "test-generation"
    assert generated["status"] == "completed"
    assert generated["model"] == "stable-diffusion"

    models_response = client.get("/api/generation/models?api_type=replicate")
    assert models_response.status_code == 200
    assert models_response.json()["models"]


def test_profile_usage(profile_id):
    response = client.get(f"/api/api-management/profiles/{profile_id}/usage")

    assert response.status_code == 200
    usage = response.json()
    assert usage["profile_id"] == profile_id
    assert usage["profile_name"] == "Test Replicate Profile"
    assert usage["usage"]["total_requests"] == 0
