import pytest

from extensions.art_extension import _required_string


@pytest.mark.parametrize("value", [None, "", "   ", 42])
def test_required_string_rejects_missing_or_invalid_payload_values(value):
    with pytest.raises(ValueError, match="prompt must be a non-empty string"):
        _required_string({"prompt": value}, "prompt")


def test_required_string_returns_nonempty_payload_text():
    assert _required_string({"prompt": "draw a landscape"}, "prompt") == "draw a landscape"
