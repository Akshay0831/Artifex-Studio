import base64
import binascii
import io
from typing import Any, Dict, Tuple, Union

import numpy as np
from PIL import Image

from models.request_schemas import ImagePaletteSettings


class PaletteProcessingError(ValueError):
    pass


class PaletteService:
    """Applies deterministic palette constraints to generated PNG-compatible images."""

    @staticmethod
    def extract_palette(image_data: bytes, max_colors: int) -> list[str]:
        if not 1 <= max_colors <= 256:
            raise PaletteProcessingError("Palette color count must be between 1 and 256")

        try:
            with Image.open(io.BytesIO(image_data)) as opened_image:
                opened_image.load()
                pixels = np.asarray(opened_image.convert("RGBA"))
        except (OSError, ValueError) as error:
            raise PaletteProcessingError("Reference is not a valid image") from error

        visible_pixels = pixels[pixels[:, :, 3] > 0, :3]
        if visible_pixels.size == 0:
            raise PaletteProcessingError("Reference image has no visible pixels")

        sample = Image.fromarray(visible_pixels.reshape(1, -1, 3))
        indexed_image = sample.quantize(
            colors=max_colors,
            method=Image.Quantize.MEDIANCUT,
            dither=Image.Dither.NONE,
        )
        indices, counts = np.unique(
            np.asarray(indexed_image), return_counts=True
        )
        image_palette = indexed_image.getpalette() or []
        color_counts: Dict[Tuple[int, int, int], int] = {}
        for index, count in zip(indices.tolist(), counts.tolist()):
            offset = int(index) * 3
            color = (
                int(image_palette[offset]),
                int(image_palette[offset + 1]),
                int(image_palette[offset + 2]),
            )
            color_counts[color] = color_counts.get(color, 0) + int(count)

        ordered_colors = sorted(
            color_counts,
            key=lambda color: (-color_counts[color], color),
        )
        return [
            f"#{red:02X}{green:02X}{blue:02X}"
            for red, green, blue in ordered_colors
        ]

    @staticmethod
    def apply(
        image_base64: str,
        settings: Union[ImagePaletteSettings, Dict[str, Any]],
    ) -> Tuple[str, Dict[str, Any]]:
        palette_settings = (
            settings
            if isinstance(settings, ImagePaletteSettings)
            else ImagePaletteSettings.model_validate(settings)
        )
        if palette_settings.mode == "off":
            return image_base64, {
                "mode": "off",
                "opaque_color_count": None,
                "colors": [],
                "alpha_preserved": False,
                "dither": False,
                "source_reference": None,
            }

        encoded_image = image_base64.split(",", 1)[-1]
        try:
            image_data = base64.b64decode(encoded_image, validate=True)
            with Image.open(io.BytesIO(image_data)) as opened_image:
                opened_image.load()
                image = opened_image.copy()
        except (binascii.Error, OSError, ValueError) as error:
            raise PaletteProcessingError("Generated image is not a valid base64 image") from error

        if "A" in image.getbands() or "transparency" in image.info:
            rgba_image = image.convert("RGBA")
            alpha = rgba_image.getchannel("A")
            rgb_image = rgba_image.convert("RGB")
        else:
            alpha = None
            rgb_image = image.convert("RGB")
        preserve_alpha = alpha is not None and palette_settings.preserve_alpha
        dither = (
            Image.Dither.FLOYDSTEINBERG
            if palette_settings.dither
            else Image.Dither.NONE
        )

        if palette_settings.mode == "fixed":
            colors = [tuple(bytes.fromhex(color[1:])) for color in palette_settings.colors]
            palette = [component for color in colors for component in color]
            palette.extend(list(colors[-1]) * (256 - len(colors)))
            palette_image = Image.new("P", (1, 1))
            palette_image.putpalette(palette)
            indexed_image = rgb_image.quantize(palette=palette_image, dither=dither)
        else:
            if palette_settings.max_colors is None:
                raise PaletteProcessingError(
                    f"{palette_settings.mode} palette mode requires a color limit"
                )
            indexed_image = rgb_image.quantize(
                colors=palette_settings.max_colors,
                method=Image.Quantize.MEDIANCUT,
                dither=dither,
            )

        indices = np.asarray(indexed_image)
        visible_indices = (
            np.unique(indices[np.asarray(alpha) > 0])
            if preserve_alpha
            else np.unique(indices)
        )
        image_palette = indexed_image.getpalette() or []
        output_colors = []
        for index in visible_indices.tolist():
            offset = int(index) * 3
            color = tuple(image_palette[offset:offset + 3])
            if color not in output_colors:
                output_colors.append(color)

        result_image = indexed_image.convert("RGB")
        if preserve_alpha and alpha is not None:
            result_image.putalpha(alpha)

        output = io.BytesIO()
        result_image.save(output, format="PNG")
        result_base64 = base64.b64encode(output.getvalue()).decode("ascii")
        return result_base64, {
            "mode": palette_settings.mode,
            "max_colors": palette_settings.max_colors,
            "colors": [f"#{red:02X}{green:02X}{blue:02X}" for red, green, blue in output_colors],
            "opaque_color_count": len(output_colors),
            "alpha_preserved": preserve_alpha,
            "dither": palette_settings.dither,
            "source_reference": (
                palette_settings.source_reference.model_dump(mode="json")
                if palette_settings.source_reference is not None
                else None
            ),
        }


palette_service = PaletteService()
