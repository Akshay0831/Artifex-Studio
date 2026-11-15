import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import api.image_processing as image_processing
from api.image_processing import (
    ImageProcessor,
    LayerAdjustmentRequest,
)


def test_alpha_mask_updates_the_stored_layer_image(monkeypatch):
    layer_data = {"image_data": np.full((2, 2, 4), 255, dtype=np.uint8)}
    monkeypatch.setitem(image_processing.layers_db, "layer-1", layer_data)
    app = FastAPI()
    app.include_router(image_processing.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(
            "/api/image-processing/mask",
            json={
                "layer_id": "layer-1",
                "mask_type": "alpha",
                "intensity": 1,
                "feather": 0,
                "mask_data": {"mask_array": [[0, 255], [128, 255]]},
            },
        )

    assert response.status_code == 200
    assert layer_data["image_data"][:, :, 3].tolist() == [[0, 255], [128, 255]]
    assert layer_data["image_data"][0, 1, :3].tolist() == [255, 255, 255]


def test_custom_mask_preserves_per_channel_values():
    image = np.full((1, 1, 3), 255, dtype=np.uint8)
    mask = np.array([[[255, 0, 0]]], dtype=np.uint8)

    result = ImageProcessor.apply_layer_mask(image, mask, mask_type="custom")

    assert result.tolist() == [[[255, 0, 0]]]


def test_curve_adjustment_clamps_inputs_outside_control_points():
    image = np.array([[[0, 0, 0], [255, 255, 255]]], dtype=np.uint8)

    result = ImageProcessor.apply_curves_adjustment(image, [(100, 50), (200, 200)])

    assert result.tolist() == [[[50, 50, 50], [200, 200, 200]]]


def test_adjustment_type_pattern_rejects_prefix_matches():
    with pytest.raises(ValidationError):
        LayerAdjustmentRequest(
            layer_id="layer-1",
            adjustment_type="brightness-extra",
            value=1,
            opacity=1,
        )
