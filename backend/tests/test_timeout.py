import asyncio

import pytest

from utils.timeout import async_run_with_timeout, timeout_context


@pytest.mark.asyncio
async def test_zero_timeout_is_honored():
    async def delayed_result():
        await asyncio.sleep(0.01)
        return "finished"

    with pytest.raises(TimeoutError):
        await async_run_with_timeout(delayed_result, timeout_seconds=0)


@pytest.mark.asyncio
async def test_timeout_returns_an_explicit_fallback():
    async def delayed_result():
        await asyncio.sleep(0.01)
        return "finished"

    result = await async_run_with_timeout(
        delayed_result,
        timeout_seconds=0,
        default_value="fallback",
    )

    assert result == "fallback"


def test_timeout_context_rejects_exit_before_enter():
    context = timeout_context(1)

    with pytest.raises(RuntimeError, match="exited before it was entered"):
        context.__exit__(None, None, None)
