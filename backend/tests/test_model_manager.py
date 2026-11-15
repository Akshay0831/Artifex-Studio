import pytest

import ai_models.model_manager as model_manager
from ai_models.model_manager import ModelManager
from ai_models.model_types import ModelType, QuantizationType, get_model_type


def test_unknown_model_types_are_rejected_instead_of_defaulting_to_sdxl():
    with pytest.raises(ValueError, match="Unsupported model type"):
        get_model_type("unknown-model")


def test_model_manager_rejects_unimplemented_pipeline_options():
    manager = ModelManager()

    with pytest.raises(NotImplementedError, match="Pipeline type"):
        manager.GetPipeline(ModelType.SDXL, pipeline_type="inpaint")

    with pytest.raises(NotImplementedError, match="Quantization type"):
        manager.GetPipeline(ModelType.SDXL, quantization=QuantizationType.INT8)


def test_pipeline_class_matches_requested_model_type(monkeypatch):
    class FakePipeline:
        def __init__(self, model_id, dtype):
            self.model_id = model_id
            self.dtype = dtype

        @classmethod
        def from_pretrained(cls, model_id, torch_dtype):
            return cls(model_id, torch_dtype)

        def enable_model_cpu_offload(self):
            pass

    class FakeSDXL(FakePipeline):
        pass

    class FakeSD15(FakePipeline):
        pass

    monkeypatch.setattr(model_manager, "StableDiffusionXLPipeline", FakeSDXL)
    monkeypatch.setattr(model_manager, "StableDiffusionPipeline", FakeSD15)
    monkeypatch.setattr(model_manager.torch.cuda, "is_available", lambda: False)

    manager = ModelManager()

    pipeline = manager._load_pipeline(ModelType.SD15)

    assert isinstance(pipeline, FakeSD15)
    assert pipeline.model_id == "runwayml/stable-diffusion-v1-5"
    assert pipeline.dtype is not None
