from typing import Any

from fastapi import WebSocket
import pytest

import extensions.project_extension as project_extension
from project_service import SceneAnalysisUnavailableError, project_service


class FakeWebSocket(WebSocket):
    def __init__(self) -> None:
        self.messages: list[Any] = []

    async def send_json(self, data: Any, mode: str = "text") -> None:
        self.messages.append(data)


@pytest.mark.asyncio
async def test_scene_analysis_service_does_not_return_placeholder_metadata():
    with pytest.raises(SceneAnalysisUnavailableError, match="no analysis backend"):
        await project_service.analyze_scene(image_b64="image-data")


@pytest.mark.asyncio
async def test_scene_analysis_websocket_reports_unavailable_without_success(monkeypatch):
    async def unavailable_analysis(*_args):
        raise SceneAnalysisUnavailableError("Scene analysis is unavailable.")

    monkeypatch.setattr(project_extension.project_service, "analyze_scene", unavailable_analysis)

    websocket = FakeWebSocket()
    await project_extension.handle_analyze_scene(
        websocket,
        {"type": "analyze_scene", "image_b64": "image-data"},
    )

    assert websocket.messages == [{
        "type": "error",
        "operation": "analyze_scene",
        "code": "SCENE_ANALYSIS_UNAVAILABLE",
        "message": "Scene analysis is unavailable.",
    }]
