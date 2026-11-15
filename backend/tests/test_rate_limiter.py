import asyncio

from fastapi import Request
from fastapi.responses import Response
from utils import rate_limiter as rate_limiter_module
from utils.rate_limiter import RateLimiter


def test_new_key_is_initialized_and_limited():
    limiter = RateLimiter()

    assert limiter.is_allowed("client", max_requests=2) == (True, 1)
    assert limiter.is_allowed("client", max_requests=2) == (True, 0)
    assert limiter.is_allowed("client", max_requests=2) == (False, 0)


def test_rate_limit_info_uses_the_configured_instance_limit(monkeypatch):
    limiter = RateLimiter(max_requests=3, window_seconds=10)
    monkeypatch.setattr(rate_limiter_module, "API_RATE_LIMITER", limiter)

    info = asyncio.run(rate_limiter_module.get_rate_limit_info("new-client"))

    assert info["limit"] == 3
    assert info["remaining"] == 3


def test_rate_limit_middleware_handles_requests_without_client(monkeypatch):
    limiter = RateLimiter(max_requests=3, window_seconds=10)
    monkeypatch.setattr(rate_limiter_module, "API_RATE_LIMITER", limiter)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/test",
        "headers": [],
        "query_string": b"",
        "client": None,
        "server": None,
        "scheme": "http",
    })

    async def call_next(request: Request) -> Response:
        assert request.url.path == "/api/test"
        return Response()

    response = asyncio.run(rate_limiter_module.rate_limit_middleware(request, call_next))

    assert response.headers["X-RateLimit-Limit"] == "3"
