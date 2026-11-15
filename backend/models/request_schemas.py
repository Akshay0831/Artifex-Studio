import re
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class PaletteSourceReference(BaseModel):
    project_id: str
    reference_id: str
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    original_filename: str


class ImagePaletteSettings(BaseModel):
    mode: Literal["off", "extract", "fixed", "maximum"] = "off"
    colors: List[str] = Field(default_factory=list, max_length=256)
    max_colors: Optional[int] = Field(default=None, ge=1, le=256)
    dither: bool = False
    preserve_alpha: bool = True
    source_reference: Optional[PaletteSourceReference] = None

    @field_validator("colors")
    @classmethod
    def validate_palette_colors(cls, colors: List[str]) -> List[str]:
        normalized = []
        for color in colors:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise ValueError("Palette colors must use the #RRGGBB format")
            value = color.upper()
            if value not in normalized:
                normalized.append(value)
        return normalized

    @model_validator(mode="after")
    def validate_mode_options(self):
        if self.source_reference is not None and self.mode != "fixed":
            raise ValueError("A source reference requires fixed palette mode")
        if self.mode == "fixed":
            if not self.colors:
                raise ValueError("Fixed palette mode requires at least one color")
            if self.max_colors is not None:
                raise ValueError("Fixed palette mode does not accept max_colors")
        elif self.mode in {"extract", "maximum"}:
            if self.max_colors is None:
                raise ValueError(f"{self.mode} palette mode requires max_colors")
            if self.colors:
                raise ValueError(f"{self.mode} palette mode does not accept fixed colors")
        elif self.colors or self.max_colors is not None:
            raise ValueError("Palette options require an active palette mode")
        return self

class GenerateImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    negative_prompt: Optional[str] = Field(None, max_length=500)
    seed: int = Field(42, ge=0)
    config: Dict = Field(default_factory=dict)
    palette: ImagePaletteSettings = Field(
        default_factory=lambda: ImagePaletteSettings.model_validate({})
    )
    prefer_local: bool = Field(True)

class InpaintImageRequest(BaseModel):
    base_image: str = Field(..., description="Base64 encoded image")
    mask_image: str = Field(..., description="Base64 encoded mask")
    prompt: str = Field(..., min_length=1, max_length=1000)
    seed: int = Field(42, ge=0)
    config: Dict = Field(default_factory=dict)
    prefer_local: bool = Field(True)

class ComposeAudioRequest(BaseModel):
    bpm: int = Field(120, ge=60, le=240)
    key: str = Field("C")
    scale: str = Field("Major")
    mood: str = Field("Neutral")
    bars: int = Field(4, ge=1, le=32)
    seed: int = Field(42, ge=0)
    layers: List[str] = Field(default_factory=lambda: ["bass", "lead", "drums", "ambient"])
    config: Dict = Field(default_factory=dict)
    prefer_local: bool = Field(True)
