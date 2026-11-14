import json

import pytest
from fastapi.testclient import TestClient

import extensions.audio_extension as audio_extension
from ai_models.audio_model import AudioGenerationUnavailableError, AudioModel
from app import app
from websocket_handler import WebSocketManager


client = TestClient(app)


def test_audio_model_reports_generation_unavailable():
    with pytest.raises(AudioGenerationUnavailableError, match="no real audio model backend"):
        AudioModel().Generate("ambient piano")


def test_audio_compose_endpoint_returns_service_unavailable(monkeypatch):
    async def unavailable_compose(**_kwargs):
        raise AudioGenerationUnavailableError("No audio backend configured.")

    monkeypatch.setattr(
        "routes.audio.audio_service.compose",
        unavailable_compose,
    )

    response = client.post("/api/audio/compose", json={})

    assert response.status_code == 503
    assert response.json()["detail"] == "No audio backend configured."


@pytest.mark.asyncio
async def test_audio_websocket_reports_unavailable_without_completion(monkeypatch):
    async def unavailable_compose(*_args):
        raise AudioGenerationUnavailableError("No audio backend configured.")

    monkeypatch.setattr(audio_extension.audio_service, "compose", unavailable_compose)

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    websocket = FakeWebSocket()
    await audio_extension.handle_regenerate_audio(
        websocket,
        {"type": "regenerate_audio", "seed": 7},
    )

    assert websocket.messages == [{
        "type": "error",
        "operation": "regenerate_audio",
        "code": "AUDIO_GENERATION_UNAVAILABLE",
        "message": "No audio backend configured.",
    }]


@pytest.mark.asyncio
async def test_websocket_errors_include_the_requested_operation():
    manager = WebSocketManager()

    async def fail_handler(_websocket, _payload):
        raise RuntimeError("Audio composition failed.")

    manager.register_handler("regenerate_audio", fail_handler)

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    websocket = FakeWebSocket()
    await manager.handle_message(
        websocket,
        json.dumps({"type": "regenerate_audio"}),
    )

    assert websocket.messages == [{
        "type": "error",
        "message": "Audio composition failed.",
        "operation": "regenerate_audio",
    }]
