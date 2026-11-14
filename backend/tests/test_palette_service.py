import base64
import io

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from models.request_schemas import ImagePaletteSettings
from services.palette_service import PaletteService


def image_base64(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def decode_image(image_data):
    return Image.open(io.BytesIO(base64.b64decode(image_data)))


def visible_color_count(image):
    rgba = np.asarray(image.convert("RGBA"))
    visible_pixels = rgba[rgba[:, :, 3] > 0, :3]
    return len(np.unique(visible_pixels, axis=0))


def test_maximum_palette_enforces_limit_deterministically_and_preserves_alpha():
    pixels = np.zeros((12, 12, 4), dtype=np.uint8)
    for row in range(12):
        for column in range(12):
            pixels[row, column] = (
                row * 20,
                column * 20,
                (row + column) * 10,
                0 if (row + column) % 5 == 0 else (row * 17) % 256,
            )
    source = Image.fromarray(pixels, mode="RGBA")
    encoded = image_base64(source)
    settings = ImagePaletteSettings(
        mode="maximum",
        max_colors=4,
        dither=False,
        preserve_alpha=True,
    )

    first, metadata = PaletteService.apply(encoded, settings)
    second, _ = PaletteService.apply(encoded, settings)
    output = decode_image(first)

    assert first == second
    assert output.mode == "RGBA"
    assert np.array_equal(
        np.asarray(output.getchannel("A")),
        np.asarray(source.getchannel("A")),
    )
    assert visible_color_count(output) <= 4
    assert metadata["opaque_color_count"] <= 4
    assert metadata["alpha_preserved"] is True


def test_fixed_palette_uses_only_selected_colors():
    source = Image.new("RGB", (4, 1))
    source.putdata([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)])
    encoded = image_base64(source)
    settings = ImagePaletteSettings(
        mode="fixed",
        colors=["#FF0000", "#0000FF"],
        preserve_alpha=True,
    )

    output_base64, metadata = PaletteService.apply(encoded, settings)
    output = decode_image(output_base64).convert("RGB")

    assert set(map(tuple, np.asarray(output).reshape(-1, 3).tolist())) <= {
        (255, 0, 0),
        (0, 0, 255),
    }
    assert metadata["opaque_color_count"] <= 2


def test_extract_mode_reduces_the_generated_image_to_requested_color_count():
    source = Image.new("RGB", (20, 1))
    source.putdata([(index * 10, 255 - index * 10, index * 5) for index in range(20)])

    output_base64, metadata = PaletteService.apply(
        image_base64(source),
        ImagePaletteSettings(mode="extract", max_colors=3),
    )

    assert visible_color_count(decode_image(output_base64)) <= 3
    assert metadata["mode"] == "extract"


@pytest.mark.parametrize(
    "values",
    [
        {"mode": "fixed"},
        {"mode": "maximum"},
        {"mode": "off", "max_colors": 2},
        {"mode": "fixed", "colors": ["red"]},
    ],
)
def test_palette_settings_reject_contradictory_or_invalid_options(values):
    with pytest.raises(ValidationError):
        ImagePaletteSettings(**values)
