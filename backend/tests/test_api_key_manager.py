import datetime
import json

from config.api_key_manager import APIKeyManager


def test_missing_profile_creation_time_is_replaced_with_utc_timestamp(tmp_path):
    config_file = tmp_path / "api_keys.json"
    config_file.write_text(
        json.dumps(
            {
                "profiles": {
                    "Test": {
                        "name": "Test",
                        "api_key": "test-key",
                        "usage_count": 4,
                    }
                },
                "current_profile": "Test",
            }
        ),
        encoding="utf-8",
    )
    manager = APIKeyManager.__new__(APIKeyManager)
    manager.profiles = {}
    manager.current_profile = None
    manager.config_file = config_file

    manager.load_config()

    created_at = manager.profiles["Test"].created_at
    assert created_at is not None
    assert datetime.datetime.fromisoformat(created_at).utcoffset() == datetime.timedelta(0)
