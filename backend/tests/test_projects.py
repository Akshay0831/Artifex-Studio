import hashlib
import io
import json
import zipfile
from uuid import uuid4

import numpy as np
import pytest
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


def test_editor_state_api_persists_per_project_and_enforces_size_limit(
    tmp_path, monkeypatch
):
    service = ProjectAssetService(tmp_path, max_editor_state_bytes=32)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    endpoint = f"/api/projects/{project['id']}/editor-state"

    assert client.get(endpoint).status_code == 204
    state = b"\x00Yjs editor state"
    saved = client.put(endpoint, content=state)

    assert saved.status_code == 200
    assert saved.json() == {"status": "saved", "size_bytes": len(state)}
    assert client.get(endpoint).content == state
    assert client.put(endpoint, content=b"").status_code == 422
    assert client.put(endpoint, content=b"x" * 33).status_code == 413
    assert client.get(f"/api/projects/{uuid4()}/editor-state").status_code == 404

    restored_service = ProjectAssetService(tmp_path, max_editor_state_bytes=32)
    monkeypatch.setattr(project_routes, "project_asset_service", restored_service)
    assert client.get(endpoint).content == state


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


def test_reference_palette_endpoint_returns_limited_colors_and_provenance(
    tmp_path, monkeypatch
):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    source = Image.new("RGB", (4, 1))
    source.putdata([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)])
    data = io.BytesIO()
    source.save(data, format="PNG")
    reference = service.create_reference(
        project["id"],
        "palette-source.png",
        data.getvalue(),
    )

    response = client.get(
        f"/api/projects/{project['id']}/references/{reference['id']}/palette",
        params={"max_colors": 2},
    )

    assert response.status_code == 200
    result = response.json()
    assert len(result["colors"]) <= 2
    assert result["source_reference"] == {
        "project_id": project["id"],
        "reference_id": reference["id"],
        "sha256": reference["sha256"],
        "original_filename": "palette-source.png",
    }


def test_reference_palette_endpoint_rejects_audio_and_out_of_range_limits(
    tmp_path, monkeypatch
):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    audio_reference = service.create_reference(
        project["id"],
        "sample.wav",
        audio_bytes(),
    )

    audio_response = client.get(
        f"/api/projects/{project['id']}/references/{audio_reference['id']}/palette"
    )
    invalid_limit = client.get(
        f"/api/projects/{project['id']}/references/{audio_reference['id']}/palette",
        params={"max_colors": 257},
    )

    assert audio_response.status_code == 415
    assert invalid_limit.status_code == 422


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


def test_project_bundle_round_trip_preserves_metadata_and_original_reference(tmp_path):
    service = ProjectAssetService(tmp_path)
    project = service.create_project(
        "Portable project",
        "Bundle test",
        ["sprites"],
        {"canvas": {"width": 64}},
    )
    original = image_bytes()
    reference = service.create_reference(
        project["id"],
        "reference.png",
        original,
        role="palette",
        source="artist-provided",
    )
    editor_state = b"\x00Yjs project state"
    service.save_editor_state(project["id"], editor_state)

    bundle = service.export_project_bundle(project["id"])
    restored_service = ProjectAssetService(tmp_path / "restored")
    restored = restored_service.import_project_bundle(bundle)
    restored_reference = restored_service.list_references(restored["id"])[0]

    assert restored["id"] != project["id"]
    assert restored["name"] == project["name"]
    assert restored["description"] == project["description"]
    assert restored["tags"] == project["tags"]
    assert restored["config"] == project["config"]
    assert restored_service.get_editor_state(restored["id"]) == editor_state
    assert restored_reference["id"] != reference["id"]
    assert restored_reference["sha256"] == reference["sha256"]
    assert restored_service.reference_content_path(
        restored["id"], restored_reference["id"]
    ).read_bytes() == original


def test_project_bundle_imports_legacy_v1_without_editor_state(tmp_path):
    manifest = {
        "format_version": 1,
        "project": {"name": "Legacy bundle", "description": "", "tags": [], "config": {}},
        "references": [],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))

    service = ProjectAssetService(tmp_path)
    imported = service.import_project_bundle(buffer.getvalue())

    assert imported["name"] == "Legacy bundle"
    assert service.get_editor_state(imported["id"]) is None


def test_project_bundle_rejects_changed_editor_state_bytes(tmp_path):
    source = ProjectAssetService(tmp_path / "source")
    project = source.create_project("State integrity", "", [], {})
    source.save_editor_state(project["id"], b"\x00Yjs state")
    exported = source.export_project_bundle(project["id"])
    tampered = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(exported), "r") as original:
        with zipfile.ZipFile(tampered, "w") as modified:
            for entry in original.infolist():
                contents = original.read(entry.filename)
                if entry.filename == "editor-state.yjs":
                    contents = contents[:-1] + bytes([contents[-1] ^ 1])
                modified.writestr(entry.filename, contents)

    destination = ProjectAssetService(tmp_path / "destination")
    with pytest.raises(ValueError, match="Editor-state checksum"):
        destination.import_project_bundle(tampered.getvalue())

    assert destination.list_projects() == []


def test_project_bundle_rejects_unsafe_paths_before_creating_a_project(tmp_path):
    service = ProjectAssetService(tmp_path)
    manifest = {
        "format_version": 1,
        "project": {"name": "Unsafe", "description": "", "tags": [], "config": {}},
        "references": [],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("../outside.txt", "not allowed")

    with pytest.raises(ValueError, match="unsafe or duplicate path"):
        service.import_project_bundle(buffer.getvalue())

    assert service.list_projects() == []


def test_project_bundle_rejects_changed_reference_bytes(tmp_path):
    source = ProjectAssetService(tmp_path / "source")
    project = source.create_project("Integrity test", "", [], {})
    source.create_reference(project["id"], "ref.png", image_bytes())
    exported = source.export_project_bundle(project["id"])
    tampered = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(exported), "r") as original:
        with zipfile.ZipFile(tampered, "w") as modified:
            for entry in original.infolist():
                contents = original.read(entry.filename)
                if entry.filename.startswith("references/"):
                    contents = contents[:-1] + bytes([contents[-1] ^ 1])
                modified.writestr(entry.filename, contents)

    destination = ProjectAssetService(tmp_path / "destination")
    with pytest.raises(ValueError, match="checksum"):
        destination.import_project_bundle(tampered.getvalue())

    assert destination.list_projects() == []


def test_project_bundle_rolls_back_if_decoded_media_fails_validation(tmp_path):
    content = b"corrupt image bytes"
    reference_id = str(uuid4())
    manifest = {
        "format_version": 1,
        "project": {"name": "Invalid media", "description": "", "tags": [], "config": {}},
        "references": [
            {
                "id": reference_id,
                "original_filename": "corrupt.png",
                "media_type": "image",
                "media_format": "png",
                "size_bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "role": None,
                "source": None,
            }
        ],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr(f"references/{reference_id}/original.png", content)

    service = ProjectAssetService(tmp_path)
    with pytest.raises(ValueError, match="invalid or unsupported reference"):
        service.import_project_bundle(buffer.getvalue())

    assert service.list_projects() == []
    assert not list((tmp_path / ".trash").iterdir())


def test_project_bundle_endpoints_export_and_import(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()
    data = image_bytes()
    assert service.create_reference(project["id"], "ref.png", data)["size_bytes"] == len(data)

    exported = client.get(f"/api/projects/{project['id']}/bundle")
    imported = client.post(
        "/api/projects/bundle",
        files={"file": ("project.zip", exported.content, "application/zip")},
    )

    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/zip"
    assert imported.status_code == 201
    imported_project = imported.json()
    assert imported_project["id"] != project["id"]
    assert len(service.list_references(imported_project["id"])) == 1

    invalid = client.post(
        "/api/projects/bundle",
        files={"file": ("invalid.zip", b"not a bundle", "application/zip")},
    )
    assert invalid.status_code == 400


def test_project_bundle_endpoints_enforce_configured_size_limit(tmp_path, monkeypatch):
    service = ProjectAssetService(tmp_path, max_bundle_bytes=32)
    monkeypatch.setattr(project_routes, "project_asset_service", service)
    project = create_project()

    oversized_export = client.get(f"/api/projects/{project['id']}/bundle")
    oversized_import = client.post(
        "/api/projects/bundle",
        files={"file": ("large.zip", b"x" * 33, "application/zip")},
    )

    assert oversized_export.status_code == 413
    assert oversized_import.status_code == 413
