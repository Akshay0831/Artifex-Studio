import hashlib
import io
import json
from uuid import uuid4

import numpy as np
import soundfile
from fastapi.testclient import TestClient
from PIL import Image

import routes.project.projects as project_routes
from app import app
from services.project_asset_service import ProjectAssetService


client = TestClient(app)


def image_bytes(width=3, height=2):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color=(20, 40, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


def audio_bytes(seconds=1):
    buffer = io.BytesIO()
    soundfile.write(
        buffer,
        np.zeros(8000 * seconds, dtype=np.float32),
        8000,
        format="WAV",
    )
    return buffer.getvalue()


def create_project():
    response = client.post(
        "/api/projects",
        json={"name": "Reference project", "config": {"seed": 7}},
    )
    assert response.status_code == 200
    return response.json()


def test_project_crud_persists_across_service_instances(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)

    created = create_project()
    updated_response = client.put(
        f"/api/projects/{created['id']}",
        json={
            "name": "Updated project",
            "description": "Persisted description",
            "tags": ["test"],
            "config": {"seed": 9},
        },
    )
    assert updated_response.status_code == 200

    restored_service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", restored_service)
    restored = client.get(f"/api/projects/{created['id']}")

    assert restored.status_code == 200
    assert restored.json()["name"] == "Updated project"
    assert restored.json()["config"] == {"seed": 9}
    assert len(client.get("/api/projects").json()["projects"]) == 1
    assert json.loads(
        (tmp_path / created["id"] / "config.json").read_text(encoding="utf-8")
    ) == {"seed": 9}


def test_legacy_project_directory_is_migrated(tmp_path):
    legacy_id = str(uuid4())
    legacy_directory = tmp_path / legacy_id
    legacy_directory.mkdir()
    (legacy_directory / "config.json").write_text(
        json.dumps({"legacy": True}), encoding="utf-8"
    )

    projects = ProjectAssetService(tmp_path).list_projects()

    assert len(projects) == 1
    assert projects[0]["id"] == legacy_id
    assert projects[0]["config"] == {"legacy": True}
    assert (legacy_directory / "manifest.json").is_file()


def test_image_reference_is_validated_persisted_and_downloadable(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    data = image_bytes()

    upload = client.post(
        f"/api/projects/{project['id']}/references",
        data={"role": "palette", "source": "local sample"},
        files={"file": ("../../palette.png", data, "text/plain")},
    )

    assert upload.status_code == 201
    reference = upload.json()
    assert reference["original_filename"] == "palette.png"
    assert reference["media_type"] == "image"
    assert reference["media_info"]["width"] == 3
    assert reference["sha256"] == hashlib.sha256(data).hexdigest()

    restored_service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", restored_service)
    listed = client.get(f"/api/projects/{project['id']}/references")
    assert listed.status_code == 200
    assert listed.json()["references"][0]["id"] == reference["id"]

    download = client.get(
        f"/api/projects/{project['id']}/references/{reference['id']}/content"
    )
    assert download.status_code == 200
    assert download.content == data
    assert download.headers["content-type"] == "image/png"
    assert download.headers["content-disposition"].startswith("inline;")

    deleted = client.delete(
        f"/api/projects/{project['id']}/references/{reference['id']}"
    )
    assert deleted.status_code == 200
    assert client.get(
        f"/api/projects/{project['id']}/references/{reference['id']}"
    ).status_code == 404


def test_audio_reference_records_decoded_metadata(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    data = audio_bytes()

    upload = client.post(
        f"/api/projects/{project['id']}/references",
        files={"file": ("sample.wav", data, "application/octet-stream")},
    )

    assert upload.status_code == 201
    reference = upload.json()
    assert reference["media_type"] == "audio"
    assert reference["media_format"] == "wav"
    assert reference["media_info"]["duration_seconds"] == 1
    assert reference["media_info"]["sample_rate"] == 8000


def test_reference_upload_rejects_unsupported_and_oversized_content(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path, max_upload_bytes=32)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()

    oversized = client.post(
        f"/api/projects/{project['id']}/references",
        files={"file": ("large.png", b"x" * 33, "image/png")},
    )
    unsupported = client.post(
        f"/api/projects/{project['id']}/references",
        files={"file": ("fake.png", b"not an image", "image/png")},
    )

    assert oversized.status_code == 413
    assert unsupported.status_code == 415
