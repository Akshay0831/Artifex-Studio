import pytest
from pydantic import BaseModel
from starlette.requests import Request

from middleware.input_validation import RequestValidator, ValidationMiddleware
from utils.sanitization import sanitize_boolean, sanitize_int, sanitize_json_input


class CountRequest(BaseModel):
    count: int


def test_sanitization_results_preserve_non_string_values():
    assert sanitize_int("12").sanitized == 12
    assert sanitize_boolean("false").sanitized is False


def test_invalid_json_sanitization_returns_a_validation_error():
    result = sanitize_json_input("{")

    assert not result.is_valid
    assert result.error and result.error.startswith("Invalid JSON:")


def test_validation_middleware_accepts_only_dictionary_model_results():
    middleware = ValidationMiddleware(app=None)
    request = Request(scope={"type": "http", "headers": []})
    request.state.body_schema = CountRequest

    assert middleware._validate_body({"count": "4"}, request) == {"count": 4}
    with pytest.raises(ValueError, match="JSON object"):
        middleware._validate_body([], request)


def test_boolean_field_validation_rejects_unrecognized_values():
    assert not RequestValidator.validate_field_types({"enabled": "maybe"}, {"enabled": bool})
    assert RequestValidator.validate_field_types({"enabled": "false"}, {"enabled": bool})


def test_length_validation_rejects_non_string_values():
    assert not RequestValidator.validate_length(42)
