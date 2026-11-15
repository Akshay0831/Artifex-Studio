from pathlib import Path
import zipfile
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backup_service import BackupService
from routes import backup as backup_routes


@pytest.mark.asyncio
async def test_project_backup_metadata_survives_reload(tmp_path):
    project_dir = tmp_path / "projects" / "project-1"
    project_dir.mkdir(parents=True)
    (project_dir / "project.json").write_text("{}", encoding="utf-8")

    with patch("backup_service.settings.STUDIO_ROOT", str(tmp_path)):
        service = BackupService()
        result = await service.create_backup(project_id="project-1", manual=True)
        reloaded_service = BackupService()

    assert result["success"] is True
    metadata_path = Path(result["backup_path"]).with_suffix(".json")
    assert metadata_path.exists()
    assert reloaded_service.get_backup_info(result["backup_id"]) is not None


@pytest.mark.asyncio
async def test_full_backup_includes_config_files_inside_archive(tmp_path):
    config_dir = tmp_path / "backend"
    config_dir.mkdir()
    (config_dir / "config.py").write_text("CONFIG = True", encoding="utf-8")

    with patch("backup_service.settings.STUDIO_ROOT", str(tmp_path)):
        service = BackupService()
        result = await service.create_backup()

    assert result["success"] is True
    with zipfile.ZipFile(result["backup_path"]) as archive:
        assert "backend/config.py" in archive.namelist()


def test_backup_create_and_download_routes_return_working_contract(tmp_path):
    project_dir = tmp_path / "projects" / "project-2"
    project_dir.mkdir(parents=True)
    (project_dir / "project.json").write_text("{}", encoding="utf-8")

    with patch("backup_service.settings.STUDIO_ROOT", str(tmp_path)):
        service = BackupService()
        app = FastAPI()
        app.include_router(backup_routes.router, prefix="/api")
        with patch.object(backup_routes, "backup_service", service), TestClient(app) as client:
            create_response = client.post(
                "/api/backup/create",
                json={"project_id": "project-2", "manual": True},
            )
            assert create_response.status_code == 200
            backup = create_response.json()

            download_response = client.get(
                f"/api/backup/download/{backup['backup_id']}"
            )
            restore_response = client.post(
                f"/api/backup/restore/{backup['backup_id']}",
                json={},
            )

    assert backup["success"] is True
    assert download_response.status_code == 200
    assert download_response.headers["content-type"] == "application/zip"
    assert download_response.content.startswith(b"PK")
    assert restore_response.status_code == 200
    restored_project_id = restore_response.json()["project_id"]
    assert (
        tmp_path / "projects" / restored_project_id / "project.json"
    ).read_text(encoding="utf-8") == "{}"


def test_unimplemented_backup_controls_report_unavailable(tmp_path):
    with patch("backup_service.settings.STUDIO_ROOT", str(tmp_path)):
        service = BackupService()
        app = FastAPI()
        app.include_router(backup_routes.router, prefix="/api")
        with patch.object(backup_routes, "backup_service", service), TestClient(app) as client:
            status_response = client.get("/api/backup/auto-backup/status")
            enable_response = client.post("/api/backup/auto-backup/enable")
            schedule_response = client.post("/api/backup/schedule-auto")

    assert status_response.json()["auto_backup_enabled"] is False
    assert status_response.json()["is_due"] is False
    assert enable_response.status_code == 501
    assert "not implemented" in enable_response.json()["detail"]
    assert schedule_response.status_code == 501
    assert "not implemented" in schedule_response.json()["detail"]
