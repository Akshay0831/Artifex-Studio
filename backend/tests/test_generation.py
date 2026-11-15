import base64
import time
from uuid import uuid4

import pytest
import requests
from fastapi.testclient import TestClient

from app import app
from art_service import art_service
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
    ("api_type", "provider_method"),
    [
        ("replicate", "_generate_replicate"),
        ("runpod", "_generate_runpod"),
        ("openai", "_generate_openai"),
    ],
)
@pytest.mark.asyncio
async def test_art_provider_receives_selected_profile_key(
    api_type, provider_method, monkeypatch
):
    received = {}

    async def fake_provider(
        prompt,
        seed,
        gen_config,
        model,
        stream_callback=None,
        *,
        api_key=None,
    ):
        received["api_key"] = api_key
        return {"image_base64": "encoded-image", "seed": seed, "backend": "api"}

    monkeypatch.setattr(art_service, provider_method, fake_provider)

    result = await art_service._generate_api(
        {
            "api_type": api_type,
            "api_key": "test-provider-key",
            "prompt": "A test image",
            "seed": 7,
            "gen_config": {},
            "model": "test-model",
        }
    )

    assert received["api_key"] == "test-provider-key"
    assert result["image_base64"] == "encoded-image"


@pytest.mark.parametrize(
    ("field", "value", "expected_error"),
    [
        ("prompt", None, "A non-empty prompt is required"),
        ("seed", None, "An integer seed is required"),
        ("model", None, "A model must be selected"),
        ("gen_config", None, "settings must be an object"),
    ],
)
@pytest.mark.asyncio
async def test_api_generation_rejects_missing_or_invalid_required_values(
    field, value, expected_error
):
    config = {
        "api_type": "replicate",
        "api_key": "test-provider-key",
        "prompt": "A test image",
        "seed": 7,
        "gen_config": {},
        "model": "test-model",
    }
    config[field] = value

    result = await art_service._generate_api(config)

    assert expected_error in result["error"]


@pytest.mark.asyncio
async def test_replicate_image_response_is_encoded_as_base64(monkeypatch):
    image_bytes = b"\x89PNG\r\n\x1a\nimage"

    class FakeResponse:
        def __init__(self, status_code, payload=None, content=b""):
            self.status_code = status_code
            self.payload = payload or {}
            self.content = content
            self.text = ""

        def json(self):
            return self.payload

        def raise_for_status(self):
            return None

    def fake_post(_url, **kwargs):
        assert kwargs["headers"]["Authorization"] == "Token test-provider-key"
        return FakeResponse(201, {"urls": {"get": "prediction-url"}})

    def fake_get(url, **_kwargs):
        if url == "prediction-url":
            return FakeResponse(
                200,
                {"status": "succeeded", "output": ["image-url"]},
            )
        return FakeResponse(200, content=image_bytes)

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests, "get", fake_get)

    result = await art_service._generate_replicate(
        "A test image",
        3,
        {},
        "test-model",
        api_key="test-provider-key",
    )

    assert result["image_base64"] == base64.b64encode(image_bytes).decode("ascii")


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
