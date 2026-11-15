import pytest

import extensions.project_extension as project_extension
from project_service import SceneAnalysisUnavailableError, project_service


@pytest.mark.asyncio
async def test_scene_analysis_service_does_not_return_placeholder_metadata():
    with pytest.raises(SceneAnalysisUnavailableError, match="no analysis backend"):
        await project_service.analyze_scene(image_b64="image-data")


@pytest.mark.asyncio
async def test_scene_analysis_websocket_reports_unavailable_without_success(monkeypatch):
    async def unavailable_analysis(*_args):
        raise SceneAnalysisUnavailableError("Scene analysis is unavailable.")

    monkeypatch.setattr(project_extension.project_service, "analyze_scene", unavailable_analysis)

    class FakeWebSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

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
