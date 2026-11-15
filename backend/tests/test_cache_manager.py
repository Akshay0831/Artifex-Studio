import asyncio
import logging
from unittest.mock import Mock, patch

from utils.caching.cache_manager import CacheManager


def test_cache_manager_accepts_optional_ttl_and_tags():
    manager = CacheManager(config={"redis_enabled": False})
    try:
        assert asyncio.run(manager.set("artifact", {"status": "ready"}, tags=None))
        assert asyncio.run(manager.get("artifact")) == {"status": "ready"}
    finally:
        manager.stop()


def test_cache_manager_preserves_explicit_empty_config():
    with patch(
        "utils.caching.cache_manager.redis.from_url",
        return_value=Mock(),
    ):
        manager = CacheManager(config={})
    try:
        assert manager.config == {}
        assert manager.local_cache_size == 1000
    finally:
        manager.stop()


def test_cache_manager_rejects_nonbinary_redis_values(caplog):
    redis_client = Mock()
    redis_client.get.return_value = "not compressed bytes"
    with patch(
        "utils.caching.cache_manager.redis.from_url",
        return_value=redis_client,
    ):
        manager = CacheManager(config={"redis_enabled": True})
    try:
        with caplog.at_level(logging.ERROR, logger="studio.backend.caching"):
            result = asyncio.run(manager.get("artifact", default="fallback"))

        assert result == "fallback"
        assert "non-binary data" in caplog.text
    finally:
        manager.stop()
