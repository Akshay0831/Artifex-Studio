import asyncio
import logging
from typing import Any, Awaitable, Callable, Optional, TypeVar
from datetime import datetime

logger = logging.getLogger("studio.backend.timeout")

T = TypeVar('T')

async def async_with_timeout(
    coro: Awaitable[T],
    timeout_seconds: float,
    default_value: Optional[T] = None,
    timeout_error: str = "Timeout",
) -> T:
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        logger.warning(f"{timeout_error} after {timeout_seconds} seconds")
        if default_value is not None:
            return default_value
        raise TimeoutError(timeout_error)

def timeout_context(timeout_seconds, error_message="Timeout"):
    class TimeoutContext:
        def __init__(self):
            self._start_time = None
            self._timeout = timeout_seconds
            self._error_message = error_message
            
        def __enter__(self):
            self._start_time = datetime.now()
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            start_time = self._start_time
            if start_time is None:
                raise RuntimeError("Timeout context was exited before it was entered")

            elapsed = (datetime.now() - start_time).total_seconds()
            if elapsed > self._timeout:
                logger.warning(f"{self._error_message} after {elapsed:.2f} seconds")
                raise TimeoutError(f"{self._error_message} after {elapsed:.2f} seconds")
            return False
    
    return TimeoutContext()

async def async_run_with_timeout(
    func: Callable[..., Awaitable[T]],
    *args: Any,
    timeout_seconds: Optional[float] = None,
    default_value: Optional[T] = None,
    **kwargs: Any,
) -> T:
    async def run_func():
        return await func(*args, **kwargs)
    
    timeout = timeout_seconds if timeout_seconds is not None else 30
    return await async_with_timeout(run_func(), timeout, default_value)
