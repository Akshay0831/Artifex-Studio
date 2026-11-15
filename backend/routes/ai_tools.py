import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from art_service import art_service
from audio_service import audio_service

router = APIRouter(prefix="/tools", tags=["ai-tools"])
logger = logging.getLogger("studio.backend.routes.ai_tools")


class ToolParameter(BaseModel):
    type: str
    description: str
    default: Optional[Any] = None
    enum: Optional[List[str]] = None


class ToolDefinition(BaseModel):
    name: str
    extension_id: str
    description: str
    parameters: Dict[str, Any]
    requires_review: bool = True


class ToolManifestResponse(BaseModel):
    protocol_version: str = "1.0"
    tools: List[ToolDefinition]


class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class ToolCallResponse(BaseModel):
    tool_name: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None


MANIFEST_TOOLS: List[ToolDefinition] = [
    ToolDefinition(
        name="image.inpaint",
        extension_id="art",
        description="Fills a designated mask area on the current image canvas using diffusion guidance.",
        parameters={
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Text guidance for generated content"},
                "base_image": {"type": "string", "description": "Base image encoded as base64 PNG"},
                "mask_image": {"type": "string", "description": "Binary mask image encoded as base64 PNG"},
                "seed": {"type": "integer", "default": 42}
            },
            "required": ["prompt", "base_image", "mask_image"]
        },
        requires_review=True
    ),
    ToolDefinition(
        name="image.generate",
        extension_id="art",
        description="Generates a new image or sprite from text prompt.",
        parameters={
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Text prompt describing the visual scene"},
                "seed": {"type": "integer", "default": 0},
                "steps": {"type": "integer", "default": 20}
            },
            "required": ["prompt"]
        },
        requires_review=True
    ),
    ToolDefinition(
        name="audio.compose",
        extension_id="audio",
        description="Generates multi-track music sequence and audio stems conforming to BPM, key, and mood.",
        parameters={
            "type": "object",
            "properties": {
                "bpm": {"type": "integer", "default": 120},
                "key": {"type": "string", "default": "C"},
                "scale": {"type": "string", "default": "Major"},
                "mood": {"type": "string", "default": "Neutral"}
            }
        },
        requires_review=True
    ),
    ToolDefinition(
        name="audio.reconstruct",
        extension_id="audio",
        description="Reconstructs or generates full song arrangements (Intro, Verse, Chorus, Outro) across all layer stems from prompt instructions.",
        parameters={
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "Musical description of the song genre, instruments, and structure"},
                "bpm": {"type": "integer", "default": 120},
                "key": {"type": "string", "default": "D"},
                "scale": {"type": "string", "default": "Minor"},
                "style": {"type": "string", "default": "synthwave"}
            },
            "required": ["description"]
        },
        requires_review=True
    )
]


@router.get("/manifest", response_model=ToolManifestResponse)
async def get_tool_manifest() -> ToolManifestResponse:
    """Returns the JSON Schema tool manifest for external AI agents."""
    return ToolManifestResponse(tools=MANIFEST_TOOLS)


@router.post("/call", response_model=ToolCallResponse)
async def execute_tool_call(request: ToolCallRequest) -> ToolCallResponse:
    """Executes a tool call requested by an external or integrated AI agent."""
    try:
        if request.tool_name == "image.inpaint":
            args = request.arguments
            res = await art_service.inpaint(
                base_image_b64=args.get("base_image", ""),
                mask_image_b64=args.get("mask_image", ""),
                prompt=args.get("prompt", ""),
                seed=args.get("seed", 42),
                gen_config={}
            )
            return ToolCallResponse(tool_name=request.tool_name, status="success", result=res)

        elif request.tool_name == "image.generate":
            args = request.arguments
            res = await art_service.generate(
                prompt=args.get("prompt", ""),
                seed=args.get("seed", 0),
                gen_config={"steps": args.get("steps", 20)}
            )
            return ToolCallResponse(tool_name=request.tool_name, status="success", result=res)

        elif request.tool_name == "audio.compose":
            args = request.arguments
            res = await audio_service.compose(
                audio_config=args,
                seed=args.get("seed", 42)
            )
            return ToolCallResponse(tool_name=request.tool_name, status="success", result=res)

        elif request.tool_name == "audio.reconstruct":
            args = request.arguments
            res = await audio_service.compose(
                audio_config={
                    "bpm": args.get("bpm", 120),
                    "key": args.get("key", "D"),
                    "scale": args.get("scale", "Minor"),
                    "mood": args.get("style", "synthwave"),
                    "description": args.get("description", "")
                },
                seed=args.get("seed", 42)
            )
            return ToolCallResponse(tool_name=request.tool_name, status="success", result=res)

        else:
            raise HTTPException(status_code=404, detail=f"Tool '{request.tool_name}' not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        return ToolCallResponse(tool_name=request.tool_name, status="error", error=str(e))
