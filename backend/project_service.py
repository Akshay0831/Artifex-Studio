import logging
import asyncio
from typing import Dict, Any, Optional
from utils.base_service import BaseStudioService
from utils.telemetry import trace_performance

logger = logging.getLogger("studio.backend.project_service")


class SceneAnalysisUnavailableError(RuntimeError):
    pass


class ProjectService(BaseStudioService):
    def __init__(self):
        super().__init__("project")
        self.style_presets = {
            "cyberpunk": "cyberpunk style, neon lights, high contrast, futuristic, rainy streets, cinematic lighting",
            "fantasy": "high fantasy, ethereal, magical atmosphere, detailed textures, vibrant colors, epic scale",
            "retro": "pixel art style, 8-bit aesthetic, limited palette, nostalgic, sharp edges",
            "dark_souls": "gothic, dark atmosphere, ruined architecture, cinematic shadows, desaturated colors, somber"
        }

    @trace_performance("refine_prompt")
    async def refine_prompt(self, prompt: str, style_preset: Optional[str] = None) -> str:
        """Expands user prompt with additional descriptive detail."""
        logger.info(f"Refining prompt: {prompt[:50]}...")
        
        # Base expansion logic
        expanded = prompt
        enrichment = ", high quality, highly detailed, sharp focus"
        
        if style_preset and style_preset in self.style_presets:
            style_tags = self.style_presets[style_preset]
            expanded = f"{prompt}, {style_tags}{enrichment}"
        else:
            expanded = f"{prompt}{enrichment}"
            
        await asyncio.sleep(0.5)
        return expanded

    @trace_performance("analyze_scene")
    async def analyze_scene(self, image_b64: Optional[str] = None, audio_metadata: Optional[Dict] = None) -> Dict[str, Any]:
        raise SceneAnalysisUnavailableError(
            "Scene analysis is unavailable because no analysis backend is configured."
        )

project_service = ProjectService()
