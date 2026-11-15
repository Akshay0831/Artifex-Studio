import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import app
from routes.api_management.api_management import profiles_db
from services.api_service import ApiService, api_service


client = TestClient(app)


@pytest.fixture
def active_profile():
    profile_id = str(uuid4())
    profiles_db[profile_id] = {
        "id": profile_id,
        "name": "Generation test profile",
        "api_type": "replicate",
        "api_key": "test-key",
        "is_active": True,
        "models": ["stable-diffusion"],
        "default_model": "stable-diffusion",
        "rate_limit": 60,
        "usage_count": 0,
        "last_used": None,
    }
    yield profile_id
    profiles_db.pop(profile_id, None)


def test_generation_forwards_explicit_zero_and_optional_settings(
    active_profile, monkeypatch
):
    received = {}

    async def fake_generation_request(**kwargs):
        received.update(kwargs)
        return {"id": "test-generation", "status": "completed", "result": "image"}

    monkeypatch.setattr(api_service, "make_generation_request", fake_generation_request)

    response = client.post(
        "/api/generation/generate",
        json={
            "prompt": "A test image",
            "model": "stable-diffusion",
            "api_profile_id": active_profile,
            "generation_type": "image",
            "negative_prompt": "",
            "steps": 1,
            "cfg": 0,
            "size": "512x512",
            "batch_size": 1,
            "seed": 0,
        },
    )

    assert response.status_code == 200
    assert received == {
        "profile_id": active_profile,
        "model": "stable-diffusion",
        "prompt": "A test image",
        "generation_type": "image",
        "negative_prompt": "",
        "steps": 1,
        "cfg": 0,
        "size": "512x512",
        "batch_size": 1,
        "seed": 0,
    }


def test_local_text_generation_forwards_profile_and_temperature(monkeypatch):
    profile_id = str(uuid4())
    profiles_db[profile_id] = {
        "id": profile_id,
        "name": "Local Ollama",
        "api_type": "ollama",
        "base_url": "http://127.0.0.1:11434",
        "api_key": "",
        "is_active": True,
        "models": ["custom-model:8b"],
        "default_model": "custom-model:8b",
        "rate_limit": 60,
        "usage_count": 0,
        "last_used": None,
    }
    received = {}

    async def fake_generation_request(**kwargs):
        received.update(kwargs)
        return {"id": "test-text", "status": "completed", "result": "refined prompt"}

    monkeypatch.setattr(api_service, "make_generation_request", fake_generation_request)

    try:
        response = client.post(
            "/api/generation/generate",
            json={
                "prompt": "Make this more descriptive.",
                "model": "custom-model:8b",
                "api_profile_id": profile_id,
                "generation_type": "text",
                "temperature": 0.2,
                "system_prompt": "Rewrite while preserving intent.",
            },
        )
    finally:
        profiles_db.pop(profile_id, None)

    assert response.status_code == 200
    assert response.json()["result"] == "refined prompt"
    assert received["temperature"] == 0.2
    assert received["system_prompt"] == "Rewrite while preserving intent."
    assert received["provider_config"]["api_type"] == "ollama"
    assert received["provider_config"]["base_url"] == "http://127.0.0.1:11434"


def test_system_prompt_is_rejected_for_non_local_profiles(active_profile):
    response = client.post(
        "/api/generation/generate",
        json={
            "prompt": "A test prompt",
            "model": "stable-diffusion",
            "api_profile_id": active_profile,
            "generation_type": "text",
            "system_prompt": "Rewrite the prompt.",
        },
    )

    assert response.status_code == 400
    assert "only for local text generation" in response.json()["detail"]


@pytest.mark.parametrize("generation_type", ["image", "audio"])
def test_local_text_profiles_reject_non_text_generation(generation_type):
    profile_id = str(uuid4())
    profiles_db[profile_id] = {
        "id": profile_id,
        "name": "Local Ollama",
        "api_type": "ollama",
        "base_url": "http://127.0.0.1:11434",
        "api_key": "",
        "is_active": True,
        "models": ["custom-model:8b"],
        "default_model": "custom-model:8b",
        "rate_limit": 60,
        "usage_count": 0,
        "last_used": None,
    }
    try:
        response = client.post(
            "/api/generation/generate",
            json={
                "prompt": "A test prompt",
                "model": "custom-model:8b",
                "api_profile_id": profile_id,
                "generation_type": generation_type,
            },
        )
    finally:
        profiles_db.pop(profile_id, None)

    assert response.status_code == 400
    assert "text generation only" in response.json()["detail"]


@pytest.mark.parametrize(
    ("service_result", "expected_status"),
    [
        ({"status": "error", "error_code": "provider_error"}, 502),
        ({"status": "error", "error_code": "rate_limited"}, 429),
        ({"status": "completed", "error": "provider failure"}, 502),
        ({"status": "unknown"}, 502),
    ],
)
def test_generation_does_not_report_provider_errors_as_success(
    active_profile, monkeypatch, service_result, expected_status
):
    async def fake_generation_request(**_kwargs):
        return service_result

    monkeypatch.setattr(api_service, "make_generation_request", fake_generation_request)

    response = client.post(
        "/api/generation/generate",
        json={
            "prompt": "A test image",
            "model": "stable-diffusion",
            "api_profile_id": active_profile,
            "generation_type": "image",
        },
    )

    assert response.status_code == expected_status
    assert profiles_db[active_profile]["usage_count"] == 0


@pytest.mark.asyncio
async def test_api_service_rate_limit_allows_first_request_and_expires():
    service = ApiService()
    service.requests_per_minute = 1

    first = await service.make_generation_request(
        "test-profile", "model", "prompt", "text"
    )
    blocked = await service.make_generation_request(
        "test-profile", "model", "prompt", "text"
    )
    assert first["status"] == "completed"
    assert blocked["error_code"] == "rate_limited"

    service.rate_limits["test-profile"][0] = time.monotonic() - 61
    after_window = await service.make_generation_request(
        "test-profile", "model", "prompt", "text"
    )
    assert after_window["status"] == "completed"
