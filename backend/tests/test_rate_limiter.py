from utils.rate_limiter import RateLimiter


def test_new_key_is_initialized_and_limited():
    limiter = RateLimiter()

    assert limiter.is_allowed("client", max_requests=2) == (True, 1)
    assert limiter.is_allowed("client", max_requests=2) == (True, 0)
    assert limiter.is_allowed("client", max_requests=2) == (False, 0)
