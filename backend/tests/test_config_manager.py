from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from config_manager import ConfigManager, Environment
from routes.config import router as config_router


def test_custom_environment_is_copied_persisted_and_loaded(tmp_path):
    manager = ConfigManager(tmp_path)

    created = manager.create_custom_environment("Quality-Assurance")
    assert created == {
        "success": True,
        "environment": "quality-assurance",
        "base_environment": "development",
    }

    manager.set_config("quality-assurance", "server.port", 8123)
    assert manager.get_config(Environment.DEVELOPMENT, "server.port") == 8000

    reloaded = ConfigManager(tmp_path)
    assert "quality-assurance" in reloaded.list_environments()
    assert reloaded.get_config("quality-assurance", "server.port") == 8123


def test_custom_environment_names_and_deletion_are_validated(tmp_path):
    manager = ConfigManager(tmp_path)

    assert not manager.create_custom_environment("production")["success"]
    assert not manager.create_custom_environment("../outside")["success"]
    assert not manager.delete_custom_environment("development")["success"]

    assert manager.create_custom_environment("qa")["success"]
    assert manager.set_environment("qa")
    assert not manager.delete_custom_environment("qa")["success"]

    assert manager.set_environment(Environment.DEVELOPMENT)
    assert manager.delete_custom_environment("qa")["success"]
    assert not (tmp_path / "qa.json").exists()


def test_invalid_import_is_rejected_without_changing_stored_configuration(tmp_path):
    manager = ConfigManager(tmp_path)
    original_config = manager.get_config("development")

    result = manager.import_configuration(
        "development",
        {"server": {"port": "not-an-integer"}},
    )

    assert not result["success"]
    assert manager.get_config("development") == original_config


def test_custom_environment_api_supports_create_read_update_and_delete(tmp_path):
    manager = ConfigManager(tmp_path)
    app = FastAPI()
    app.include_router(config_router)

    with patch("routes.config.config_manager", manager), TestClient(app) as client:
        created = client.post("/config/env/qa/create")
        read = client.get("/config/env/qa")
        updated = client.put(
            "/config/env/qa",
            params={"path": "server.port", "value": "8125"},
        )
        read_updated = client.get("/config/env/qa", params={"path": "server.port"})
        deleted = client.delete("/config/env/qa")

    assert created.status_code == 200
    assert read.status_code == 200
    assert updated.status_code == 200
    assert read_updated.json()["value"] == 8125
    assert deleted.status_code == 200
