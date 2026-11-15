from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from models.request_schemas import PaletteSourceReference

class ImageResponse(BaseModel):
    image_base64: str
    seed: int
    backend: str
    metadata: Optional[Dict[str, Any]] = None
    palette: Optional[Dict[str, Any]] = None

class AudioResponse(BaseModel):
    composition: Dict[str, Any]
    seed: int
    backend: str
    metadata: Optional[Dict[str, Any]] = None


class ReferencePaletteResponse(BaseModel):
    source_reference: PaletteSourceReference
    max_colors: int
    colors: List[str]

class HealthCheck(BaseModel):
    status: str
    gpu_available: bool
    gpu_type: Optional[str]
    uptime_seconds: float
