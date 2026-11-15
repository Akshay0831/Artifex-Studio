from starlette.requests import Request

from middleware.security import SecurityMiddleware


def _request_with_origin(origin: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(b"origin", origin.encode("ascii"))],
        }
    )


def test_security_headers_only_echo_configured_origins():
    middleware = SecurityMiddleware(allowed_origins=["https://studio.example"])

    allowed_headers = middleware.get_security_headers(
        _request_with_origin("https://studio.example")
    )
    rejected_headers = middleware.get_security_headers(
        _request_with_origin("https://untrusted.example")
    )

    assert allowed_headers["Access-Control-Allow-Origin"] == "https://studio.example"
    assert "Access-Control-Allow-Origin" not in rejected_headers
    assert "Access-Control-Allow-Credentials" not in rejected_headers


def test_empty_origin_list_does_not_restore_default_origins():
    middleware = SecurityMiddleware(allowed_origins=[])

    assert middleware.allowed_origins == []
    assert "Access-Control-Allow-Origin" not in middleware.get_security_headers(
        _request_with_origin("http://localhost:5173")
    )
