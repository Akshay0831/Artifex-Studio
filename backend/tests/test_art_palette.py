import pytest
import asyncio
import base64
import io
from types import SimpleNamespace

from PIL import Image
from fastapi.testclient import TestClient

from app import app
from routes.art import art_service
from config.api_key_manager import api_key_manager


client = TestClient(app)


def test_art_route_validates_and_forwards_palette_options(monkeypatch):
    received = {}

    async def fake_generate(prompt, seed, gen_config):
        received.update(gen_config)
        return {
            "image_base64": "aGVsbG8=",
            "seed": seed,
            "backend": "test",
        }

    monkeypatch.setattr(art_service, "generate", fake_generate)

    response = client.post(
        "/api/art/generate",
        json={
            "prompt": "limited palette sprite",
            "seed": 0,
            "palette": {
                "mode": "fixed",
                "colors": ["#112233", "#AABBCC"],
                "preserve_alpha": True,
            },
        },
    )

    assert response.status_code == 200
    assert received["palette"]["mode"] == "fixed"
    assert received["palette"]["colors"] == ["#112233", "#AABBCC"]
    assert response.json()["image_base64"] == "aGVsbG8="


def test_art_route_rejects_invalid_palette_before_generation(monkeypatch):
    called = False

    async def fake_generate(**_kwargs):
        nonlocal called
        called = True
        return {"image_base64": "aGVsbG8=", "seed": 1, "backend": "test"}

    monkeypatch.setattr(art_service, "generate", fake_generate)

    response = client.post(
        "/api/art/generate",
        json={
            "prompt": "limited palette sprite",
            "palette": {"mode": "fixed", "colors": []},
        },
    )

    assert response.status_code == 422
    assert called is False


def test_art_service_applies_palette_to_generated_result(monkeypatch):
    buffer = io.BytesIO()
    source_image = Image.new("RGB", (4, 1))
    source_image.putdata([(x * 50, 255 - x * 50, 100) for x in range(4)])
    source_image.save(buffer, format="PNG")
    generated_image = base64.b64encode(buffer.getvalue()).decode("ascii")

    async def route_and_execute(*_args, **_kwargs):
        return {"backend": "local_gpu"}

    async def generate_local(*_args, **_kwargs):
        return {
            "image_base64": generated_image,
            "seed": 3,
            "backend": "local_gpu",
        }

    monkeypatch.setattr(
        api_key_manager,
        "get_current_profile",
        lambda: SimpleNamespace(api_key="test-key", api_type="replicate", default_model="sdxl"),
    )
    monkeypatch.setattr(art_service, "route_and_execute", route_and_execute)
    monkeypatch.setattr(art_service, "_generate_local", generate_local)

    result = asyncio.run(
        art_service.generate(
            prompt="palette integration test",
            seed=3,
            gen_config={
                "model": "sdxl",
                "palette": {
                    "mode": "maximum",
                    "max_colors": 2,
                    "preserve_alpha": True,
                },
            },
        )
    )

    assert result["palette"]["opaque_color_count"] <= 2
