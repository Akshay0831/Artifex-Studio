import logging
from typing import Any, Dict, NoReturn, Optional

logger = logging.getLogger(__name__)


class MultimodalGenerationUnavailableError(RuntimeError):
    """Raised when a requested cross-modal generation backend is unavailable."""


class MultimodalManager:
    """Explicitly reports the cross-modal operations not implemented by this app."""

    def GetAudioFromImage(
        self,
        image_base64: str,
        prompt: str,
        sample_rate: int = 22050,
        duration: float = 5.0,
    ) -> NoReturn:
        raise MultimodalGenerationUnavailableError(
            "Image-to-audio generation is not implemented "
            f"(payload_chars={len(image_base64)}, prompt_chars={len(prompt)}, "
            f"sample_rate={sample_rate}, duration={duration})."
        )

    def GetImageFromAudio(
        self,
        audio_base64: str,
        prompt: str,
        sample_rate: int = 22050,
        width: int = 1024,
        height: int = 1024,
    ) -> NoReturn:
        raise MultimodalGenerationUnavailableError(
            "Audio-to-image generation is not implemented "
            f"(payload_chars={len(audio_base64)}, prompt_chars={len(prompt)}, "
            f"sample_rate={sample_rate}, width={width}, height={height})."
        )


class AgenticAI:
    """Workflow runner that reports unsupported steps without fabricating outputs."""

    async def ExecuteWorkflow(
        self,
        workflow: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        execution_context = context or {}
        workflow_id = execution_context.get(
            "workflow_id", f"wf_{hash(str(workflow))}"
        )
        results: Dict[str, Any] = {
            "workflow_id": workflow_id,
            "steps": [],
            "status": "completed",
            "errors": [],
        }

        steps = workflow.get("steps", [])
        if not isinstance(steps, list):
            raise ValueError("Workflow 'steps' must be a list.")

        for step in steps:
            step_result = await self._execute_step(step)
            results["steps"].append(step_result)
            if step_result["status"] != "completed":
                results["status"] = "failed"
                results["errors"].append(step_result["error"])

        return results

    async def _execute_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        step_type = step.get("type", "unknown")
        step_name = step.get("name", "unnamed")
        logger.info("Workflow step '%s' requested unsupported type %r", step_name, step_type)

        error = f"Workflow step type {step_type!r} is not implemented."
        return {
            "step_name": step_name,
            "step_type": step_type,
            "status": "failed",
            "error": error,
        }


_multimodal_manager: Optional[MultimodalManager] = None
_agentic_ai: Optional[AgenticAI] = None


def get_multimodal_manager() -> MultimodalManager:
    """Get the global multimodal manager instance."""
    global _multimodal_manager
    if _multimodal_manager is None:
        _multimodal_manager = MultimodalManager()
    return _multimodal_manager


def get_agentic_ai() -> AgenticAI:
    """Get the global agentic AI instance."""
    global _agentic_ai
    if _agentic_ai is None:
        _agentic_ai = AgenticAI()
    return _agentic_ai
