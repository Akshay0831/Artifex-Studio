import time
import threading
from typing import Dict, Any, Optional
from fastapi import Request, HTTPException, status

# Global rate limiter instance
class RateLimiter:
    """Rate limiter using sliding window algorithm."""

    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        if max_requests < 1:
            raise ValueError("max_requests must be at least 1")
        if window_seconds < 1:
            raise ValueError("window_seconds must be at least 1")

        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, list[float]] = {}
        self.lock = threading.Lock()
        self.cleanup_interval = 300  # 5 minutes
        self.last_cleanup = time.time()

    def is_allowed(
        self,
        key: str,
        max_requests: Optional[int] = None,
        window_seconds: Optional[int] = None,
    ) -> tuple[bool, int]:
        """
        Check if a request is allowed.

        Returns:
            tuple[is_allowed, remaining_requests]
        """
        max_requests = self.max_requests if max_requests is None else max_requests
        window_seconds = self.window_seconds if window_seconds is None else window_seconds
        if max_requests < 1:
            raise ValueError("max_requests must be at least 1")
        if window_seconds < 1:
            raise ValueError("window_seconds must be at least 1")

        now = time.time()
        window_start = now - window_seconds

        with self.lock:
            # Clean up old requests periodically while holding the same lock
            # used to read and update the request buckets.
            if now - self.last_cleanup > self.cleanup_interval:
                self._cleanup_old_requests()
                self.last_cleanup = now

            # Remove expired requests
            requests = self.requests.setdefault(key, [])
            requests[:] = [timestamp for timestamp in requests if timestamp > window_start]

            # Check if limit exceeded
            if len(requests) >= max_requests:
                return False, 0

            # Add current request
            requests.append(now)

            # Calculate remaining requests
            remaining = max_requests - len(requests)

            return True, remaining

    def get_reset_time(self, key: str, window_seconds: Optional[int] = None) -> int:
        """Get the timestamp when the rate limit will be reset."""
        window_seconds = self.window_seconds if window_seconds is None else window_seconds
        if key not in self.requests or not self.requests[key]:
            return int(time.time())

        oldest_request = min(self.requests[key])
        return int(oldest_request + window_seconds)

    def get_usage_stats(self, key: str) -> Dict:
        """Get current usage statistics for a key."""
        now = time.time()
        
        with self.lock:
            if key not in self.requests:
                return {
                    "requests_per_minute": 0,
                    "total_requests": 0,
                    "last_request": None
                }
            
            # Count requests in the last minute
            cutoff_time = now - 60
            recent_requests = [t for t in self.requests[key] if t > cutoff_time]
            
            return {
                "requests_per_minute": len(recent_requests),
                "total_requests": len(self.requests[key]),
                "last_request": max(self.requests[key]) if self.requests[key] else None,
                "reset_time": self.get_reset_time(key)
            }

    def _cleanup_old_requests(self):
        """Clean up old requests older than 1 hour"""
        now = time.time()
        cutoff_time = now - 3600  # 1 hour

        for key in list(self.requests.keys()):
            self.requests[key] = [
                t for t in self.requests[key]
                if t > cutoff_time
            ]
            
            # Remove empty lists
            if not self.requests[key]:
                del self.requests[key]

    def clear_key(self, key: str):
        """Clear all requests for a specific key (for testing)."""
        if key in self.requests:
            del self.requests[key]

# Global instance
rate_limiter = RateLimiter()


# Create rate limiter instances for different endpoints
# These limits can be adjusted as needed
API_RATE_LIMITER = RateLimiter()
WEBSOCKET_RATE_LIMITER = RateLimiter()


async def rate_limit_middleware(request: Request, call_next):
    """
    Middleware to limit API request rates.

    Returns 429 Too Many Requests if rate limit is exceeded.
    """
    # Skip rate limiting for health and monitoring endpoints
    if request.url.path in ['/api/health', '/api/monitoring', '/ws']:
        return await call_next(request)

    # Skip rate limiting for WebSocket
    if request.url.path == '/ws':
        return await call_next(request)

    # Get client IP address (considering proxy headers)
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    client_ip = forwarded_for.split(',', 1)[0].strip()
    if not client_ip:
        client = request.client
        client_ip = client.host if client is not None else "unknown"

    # Check rate limit
    is_allowed, remaining = API_RATE_LIMITER.is_allowed(client_ip)

    if not is_allowed:
        reset_time = API_RATE_LIMITER.get_reset_time(client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": "Too many requests. Please try again later.",
                "retry_after": reset_time - int(time.time()),
                "code": "RATE_LIMIT_EXCEEDED"
            },
            headers={
                "X-RateLimit-Limit": str(API_RATE_LIMITER.max_requests),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset_time)
            }
        )

    # Add rate limit headers to response
    remaining = API_RATE_LIMITER.max_requests - len(API_RATE_LIMITER.requests.get(client_ip, []))

    response = await call_next(request)

    response.headers["X-RateLimit-Limit"] = str(API_RATE_LIMITER.max_requests)
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    return response


async def get_rate_limit_info(client_ip: str) -> Dict[str, Any]:
    """Get rate limit information for a client IP."""
    if client_ip not in API_RATE_LIMITER.requests:
        return {
            "limit": API_RATE_LIMITER.max_requests,
            "remaining": API_RATE_LIMITER.max_requests,
            "reset": int(time.time() + API_RATE_LIMITER.window_seconds)
        }

    count = len(API_RATE_LIMITER.requests[client_ip])
    reset_time = API_RATE_LIMITER.get_reset_time(client_ip)

    return {
        "limit": API_RATE_LIMITER.max_requests,
        "remaining": API_RATE_LIMITER.max_requests - count,
        "reset": reset_time,
        "used": count
    }
