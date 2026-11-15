import pytest

from ai_models.multimodal import (
    AgenticAI,
    MultimodalGenerationUnavailableError,
    MultimodalManager,
)


def test_cross_modal_generation_is_reported_as_unavailable():
    manager = MultimodalManager()

    with pytest.raises(MultimodalGenerationUnavailableError, match="not implemented"):
        manager.GetAudioFromImage("encoded-image", "ambient sound")

    with pytest.raises(MultimodalGenerationUnavailableError, match="not implemented"):
        manager.GetImageFromAudio("encoded-audio", "abstract image")


@pytest.mark.asyncio
async def test_workflow_without_context_reports_unsupported_step():
    result = await AgenticAI().ExecuteWorkflow(
        {"steps": [{"type": "image_generation", "name": "Create image"}]}
    )

    assert result["status"] == "failed"
    assert result["steps"][0]["status"] == "failed"
    assert result["errors"] == [
        "Workflow step type 'image_generation' is not implemented."
    ]


@pytest.mark.asyncio
async def test_workflow_rejects_malformed_steps():
    with pytest.raises(ValueError, match="'steps' must be a list"):
        await AgenticAI().ExecuteWorkflow({"steps": None})
