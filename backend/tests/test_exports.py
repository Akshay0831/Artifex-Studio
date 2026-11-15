import io
import zipfile

from fastapi.testclient import TestClient

from app import app
from routes.export import exports as export_routes


client = TestClient(app)


def configure_export_paths(tmp_path, monkeypatch):
    projects_path = tmp_path / "projects"
    output_path = tmp_path / "output"
    project_path = projects_path / "project-1"
    project_path.mkdir(parents=True)
    (project_path / "image.png").write_bytes(b"png data")
    (project_path / "notes.txt").write_text("notes", encoding="utf-8")
    monkeypatch.setattr(export_routes.settings, "PROJECTS_PATH", str(projects_path))
    monkeypatch.setattr(export_routes.settings, "OUTPUT_PATH", str(output_path))
    return project_path


def test_zip_export_is_persisted_and_downloadable(tmp_path, monkeypatch):
    configure_export_paths(tmp_path, monkeypatch)

    response = client.post(
        "/api/exports/project-1/zip",
        json={"format": "zip"},
    )

    assert response.status_code == 200
    result = response.json()
    download = client.get(result["download_url"])

    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
        assert set(archive.namelist()) == {"image.png", "notes.txt", "metadata.json"}


def test_format_export_includes_only_matching_project_files(tmp_path, monkeypatch):
    configure_export_paths(tmp_path, monkeypatch)

    response = client.post(
        "/api/exports/project-1/png",
        json={"format": "png"},
    )

    assert response.status_code == 200
    assert response.json()["count"] == 1
    download = client.get(response.json()["download_url"])

    assert download.status_code == 200
    with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
        assert set(archive.namelist()) == {"image.png", "metadata.json"}


def test_export_preserves_not_found_status(tmp_path, monkeypatch):
    monkeypatch.setattr(
        export_routes.settings,
        "PROJECTS_PATH",
        str(tmp_path / "projects"),
    )
    monkeypatch.setattr(
        export_routes.settings,
        "OUTPUT_PATH",
        str(tmp_path / "output"),
    )

    response = client.post(
        "/api/exports/missing/zip",
        json={"format": "zip"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_empty_format_export_does_not_create_archive(tmp_path, monkeypatch):
    configure_export_paths(tmp_path, monkeypatch)

    response = client.post(
        "/api/exports/project-1/wav",
        json={"format": "wav"},
    )

    assert response.status_code == 422
    assert not (tmp_path / "output" / "exports").exists()
