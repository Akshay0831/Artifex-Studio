import pytest
from pydantic import ValidationError

from routes.profiling.profiling import ProfilingRequest


def test_profiling_request_requires_measured_duration():
    with pytest.raises(ValidationError, match="duration"):
        ProfilingRequest.model_validate({"operation": "image_generation"})


def test_profiling_request_accepts_nonnegative_duration():
    request = ProfilingRequest.model_validate(
        {"operation": "image_generation", "duration": 0.125}
    )

    assert request.duration == 0.125
