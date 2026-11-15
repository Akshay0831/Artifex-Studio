import hashlib
import io
import json
import logging
import os
import shutil
import sqlite3
import tempfile
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any, Dict, Iterator, List, Optional, Tuple
from uuid import UUID, uuid4

from PIL import Image, UnidentifiedImageError

from config.config import settings

logger = logging.getLogger("studio.backend.services.project_asset_service")


class ProjectNotFoundError(LookupError):
    pass


class ReferenceNotFoundError(LookupError):
    pass


class UnsupportedReferenceError(ValueError):
    pass


class ReferenceTooLargeError(ValueError):
    pass


class ReferenceProcessingUnavailableError(RuntimeError):
    pass


class ProjectBundleInvalidError(ValueError):
    pass


class ProjectEditorStateTooLargeError(ValueError):
    pass


class ProjectEditorStateInvalidError(ValueError):
    pass


class ProjectAssetService:
    """Persists project metadata in SQLite and immutable media in project folders."""

    IMAGE_FORMATS = {
        "PNG": ("image/png", "png"),
        "JPEG": ("image/jpeg", "jpg"),
        "WEBP": ("image/webp", "webp"),
    }
    AUDIO_FORMATS = {
        "WAV": ("audio/wav", "wav"),
        "FLAC": ("audio/flac", "flac"),
        "OGG": ("audio/ogg", "ogg"),
        "AIFF": ("audio/aiff", "aiff"),
    }
    REFERENCE_ROLES = {"style", "composition", "subject", "palette"}
    MAX_BUNDLE_REFERENCES = 1000

    def __init__(
        self,
        projects_path: str | Path,
        max_upload_bytes: int = 50 * 1024 * 1024,
        max_image_dimension: int = 8192,
        max_image_pixels: int = 16_777_216,
        max_audio_seconds: int = 600,
        max_bundle_bytes: int = 512 * 1024 * 1024,
        max_editor_state_bytes: int = 128 * 1024 * 1024,
    ):
        self.root = Path(projects_path).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path = self.root / "artifex.sqlite3"
        self.max_upload_bytes = max_upload_bytes
        self.max_image_dimension = max_image_dimension
        self.max_image_pixels = max_image_pixels
        self.max_audio_seconds = max_audio_seconds
        self.max_bundle_bytes = max_bundle_bytes
        self.max_editor_state_bytes = max_editor_state_bytes
        self._initialize_database()
        self._recover_pending_deletions()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize_database(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS project_assets (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    original_filename TEXT NOT NULL,
                    storage_name TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    media_format TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    role TEXT,
                    source TEXT,
                    media_info_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    UNIQUE(project_id, id)
                );
                """
            )

    @staticmethod
    def _canonical_id(value: str) -> str:
        try:
            return str(UUID(value))
        except (ValueError, TypeError, AttributeError) as error:
            raise ProjectNotFoundError("Project not found") from error

    def project_directory(self, project_id: str) -> Path:
        project_id = self._canonical_id(project_id)
        directory = (self.root / project_id).resolve()
        if directory.parent != self.root:
            raise ProjectNotFoundError("Project not found")
        return directory

    @staticmethod
    def _write_json_atomic(path: Path, value: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                json.dump(value, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary_name, path)
        except Exception:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise

    @staticmethod
    def _write_bytes_atomic(path: Path, value: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        try:
            with os.fdopen(descriptor, "wb") as file:
                file.write(value)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary_name, path)
        except Exception:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise

    def _move_to_trash(self, path: Path, recovery_id: str) -> Optional[Path]:
        if not path.exists():
            return None
        trash_root = self.root / ".trash"
        trash_root.mkdir(parents=True, exist_ok=True)
        destination = trash_root / f"{recovery_id}__{uuid4()}"
        path.rename(destination)
        return destination

    @staticmethod
    def _restore_from_trash(trash_path: Optional[Path], original_path: Path) -> None:
        if trash_path is not None and trash_path.exists() and not original_path.exists():
            trash_path.rename(original_path)

    @staticmethod
    def _purge_trash(trash_path: Optional[Path]) -> None:
        if trash_path is None:
            return
        try:
            shutil.rmtree(trash_path)
        except OSError:
            logger.exception("Could not remove deleted project asset data from %s", trash_path)
            raise

    @staticmethod
    def _remove_failed_creation(path: Path) -> None:
        try:
            shutil.rmtree(path)
        except OSError:
            logger.exception("Could not clean up failed project asset creation at %s", path)

    def _recover_pending_deletions(self) -> None:
        trash_root = self.root / ".trash"
        if not trash_root.exists():
            return
        for trash_path in trash_root.iterdir():
            recovery_id = trash_path.name.split("__", 1)[0]
            try:
                recovery_id = str(UUID(recovery_id))
            except ValueError as error:
                raise RuntimeError(f"Invalid deletion recovery entry: {trash_path.name}") from error

            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                project = connection.execute(
                    "SELECT 1 FROM projects WHERE id = ?", (recovery_id,)
                ).fetchone()
                if project:
                    original_path = self.project_directory(recovery_id)
                else:
                    asset = connection.execute(
                        "SELECT project_id FROM project_assets WHERE id = ?",
                        (recovery_id,),
                    ).fetchone()
                    original_path = (
                        self.project_directory(asset["project_id"])
                        / "references"
                        / recovery_id
                        if asset
                        else None
                    )
                if original_path is None or original_path.exists():
                    self._purge_trash(trash_path)
                else:
                    trash_path.rename(original_path)

    @staticmethod
    def _project_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "tags": json.loads(row["tags_json"]),
            "config": json.loads(row["config_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _reference_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "original_filename": row["original_filename"],
            "media_type": row["media_type"],
            "media_format": row["media_format"],
            "size_bytes": row["size_bytes"],
            "sha256": row["sha256"],
            "role": row["role"],
            "source": row["source"],
            "media_info": json.loads(row["media_info_json"]),
            "created_at": row["created_at"],
        }

    def _migrate_legacy_project(self, project_id: str) -> None:
        project_id = self._canonical_id(project_id)
        directory = self.project_directory(project_id)
        config_path = directory / "config.json"
        if not config_path.is_file():
            return

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            exists = connection.execute(
                "SELECT 1 FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
            if exists:
                return

            with config_path.open("r", encoding="utf-8") as config_file:
                config = json.load(config_file)
            if not isinstance(config, dict):
                raise ValueError(f"Legacy project config is invalid: {project_id}")

            created_at = directory.stat().st_ctime
            project = {
                "id": project_id,
                "name": project_id,
                "description": "",
                "tags": [],
                "config": config,
                "created_at": created_at,
                "updated_at": created_at,
            }
            connection.execute(
                """
                INSERT INTO projects
                (id, name, description, tags_json, config_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    project_id,
                    project["name"],
                    project["description"],
                    json.dumps(project["tags"]),
                    json.dumps(config),
                    created_at,
                    created_at,
                ),
            )
            self._write_project_files(project)

    def _write_project_files(
        self,
        project: Dict[str, Any],
        assets: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        directory = self.project_directory(project["id"])
        directory.mkdir(parents=True, exist_ok=True)
        self._write_json_atomic(directory / "config.json", project["config"])
        self._write_json_atomic(
            directory / "manifest.json",
            {**project, "references": assets or []},
        )

    def create_project(
        self,
        name: str,
        description: str,
        tags: List[str],
        config: Dict[str, Any],
    ) -> Dict[str, Any]:
        project_id = str(uuid4())
        now = time.time()
        project = {
            "id": project_id,
            "name": name,
            "description": description,
            "tags": tags,
            "config": config,
            "created_at": now,
            "updated_at": now,
        }
        directory = self.project_directory(project_id)
        directory.mkdir(parents=True, exist_ok=False)
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    """
                    INSERT INTO projects
                    (id, name, description, tags_json, config_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        name,
                        description,
                        json.dumps(tags),
                        json.dumps(config),
                        now,
                        now,
                    ),
                )
                self._write_project_files(project)
        except Exception:
            self._remove_failed_creation(directory)
            raise
        return project

    def _get_project_row(
        self, connection: sqlite3.Connection, project_id: str
    ) -> sqlite3.Row:
        project_id = self._canonical_id(project_id)
        row = connection.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if row is None:
            raise ProjectNotFoundError("Project not found")
        return row

    def get_project(self, project_id: str) -> Dict[str, Any]:
        self._migrate_legacy_project(project_id)
        with self._connection() as connection:
            return self._project_from_row(self._get_project_row(connection, project_id))

    def list_projects(self) -> List[Dict[str, Any]]:
        for directory in self.root.iterdir():
            if directory.is_dir():
                try:
                    self._migrate_legacy_project(directory.name)
                except ProjectNotFoundError:
                    continue
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM projects ORDER BY updated_at DESC, id"
            ).fetchall()
            return [self._project_from_row(row) for row in rows]

    def update_project(
        self,
        project_id: str,
        name: str,
        description: str,
        tags: List[str],
        config: Dict[str, Any],
    ) -> Dict[str, Any]:
        project_id = self._canonical_id(project_id)
        now = time.time()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_project_row(connection, project_id)
            project = self._project_from_row(row)
            project.update(
                name=name,
                description=description,
                tags=tags,
                config=config,
                updated_at=now,
            )
            references = self._list_references(connection, project_id)
            self._write_project_files(project, references)
            connection.execute(
                """
                UPDATE projects
                SET name = ?, description = ?, tags_json = ?, config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (name, description, json.dumps(tags), json.dumps(config), now, project_id),
            )
        return project

    def update_project_config(
        self, project_id: str, config: Dict[str, Any]
    ) -> Dict[str, Any]:
        project = self.get_project(project_id)
        return self.update_project(
            project_id,
            project["name"],
            project["description"],
            project["tags"],
            config,
        )

    def editor_state_path(self, project_id: str) -> Path:
        return self.project_directory(project_id) / "editor-state.yjs"

    def get_editor_state(self, project_id: str) -> Optional[bytes]:
        project_id = self._canonical_id(project_id)
        with self._connection() as connection:
            self._get_project_row(connection, project_id)
        path = self.editor_state_path(project_id)
        if not path.is_file():
            return None
        data = path.read_bytes()
        if not data:
            raise ProjectEditorStateInvalidError("Stored editor state is empty")
        if len(data) > self.max_editor_state_bytes:
            raise ProjectEditorStateTooLargeError(
                "Stored editor state exceeds the configured byte limit"
            )
        return data

    def save_editor_state(self, project_id: str, data: bytes) -> None:
        project_id = self._canonical_id(project_id)
        if not data:
            raise ProjectEditorStateInvalidError("Editor state must not be empty")
        if len(data) > self.max_editor_state_bytes:
            raise ProjectEditorStateTooLargeError(
                "Editor state exceeds the configured byte limit"
            )

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._get_project_row(connection, project_id)
            self._write_bytes_atomic(self.editor_state_path(project_id), data)

    def delete_project(self, project_id: str) -> None:
        project_id = self._canonical_id(project_id)
        directory = self.project_directory(project_id)
        trash_path = None
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                self._get_project_row(connection, project_id)
                trash_path = self._move_to_trash(directory, project_id)
                connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        except Exception:
            self._restore_from_trash(trash_path, directory)
            raise
        self._purge_trash(trash_path)

    def _list_references(
        self, connection: sqlite3.Connection, project_id: str
    ) -> List[Dict[str, Any]]:
        rows = connection.execute(
            "SELECT * FROM project_assets WHERE project_id = ? ORDER BY created_at, id",
            (project_id,),
        ).fetchall()
        return [self._reference_from_row(row) for row in rows]

    @classmethod
    def _inspect_image(
        cls, data: bytes, max_dimension: int, max_pixels: int
    ) -> Tuple[str, str, Dict[str, Any]]:
        try:
            with Image.open(io.BytesIO(data)) as image:
                image_format = image.format
                width, height = image.size
                image.verify()
        except (
            OSError,
            ValueError,
            SyntaxError,
            EOFError,
            UnidentifiedImageError,
            Image.DecompressionBombError,
        ) as error:
            raise UnsupportedReferenceError("Uploaded image is invalid or unsupported") from error

        if image_format not in cls.IMAGE_FORMATS:
            raise UnsupportedReferenceError("Supported images are PNG, JPEG, and WebP")
        if (
            width <= 0
            or height <= 0
            or width > max_dimension
            or height > max_dimension
            or width * height > max_pixels
        ):
            raise UnsupportedReferenceError("Image dimensions exceed the configured limit")

        content_type, extension = cls.IMAGE_FORMATS[image_format]
        return "image", extension, {
            "content_type": content_type,
            "format": image_format.lower(),
            "width": width,
            "height": height,
        }

    def _inspect_audio(self, data: bytes) -> Tuple[str, str, Dict[str, Any]]:
        try:
            import soundfile
        except ImportError as error:
            raise ReferenceProcessingUnavailableError(
                "Audio validation is unavailable because SoundFile is not installed"
            ) from error
        try:
            info = soundfile.info(io.BytesIO(data))
        except (OSError, RuntimeError, ValueError, soundfile.LibsndfileError) as error:
            raise UnsupportedReferenceError("Uploaded audio is invalid or unsupported") from error

        audio_format = info.format.upper()
        if audio_format not in self.AUDIO_FORMATS:
            raise UnsupportedReferenceError("Supported audio formats are WAV, FLAC, OGG, and AIFF")
        if info.samplerate <= 0 or info.channels <= 0 or info.frames <= 0:
            raise UnsupportedReferenceError("Audio file has invalid stream metadata")
        duration_seconds = info.frames / info.samplerate
        if duration_seconds > self.max_audio_seconds:
            raise UnsupportedReferenceError("Audio duration exceeds the configured limit")

        content_type, extension = self.AUDIO_FORMATS[audio_format]
        return "audio", extension, {
            "content_type": content_type,
            "format": audio_format.lower(),
            "duration_seconds": duration_seconds,
            "sample_rate": info.samplerate,
            "channels": info.channels,
            "frames": info.frames,
        }

    @staticmethod
    def _safe_original_filename(filename: Optional[str]) -> str:
        if not filename:
            return "reference"
        name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not name or name in {".", ".."}:
            return "reference"
        return name[:255]

    def create_reference(
        self,
        project_id: str,
        filename: Optional[str],
        data: bytes,
        role: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        project_id = self._canonical_id(project_id)
        if not data:
            raise UnsupportedReferenceError("Reference file is empty")
        if len(data) > self.max_upload_bytes:
            raise ReferenceTooLargeError("Reference file exceeds the configured byte limit")
        if role is not None and role not in self.REFERENCE_ROLES:
            raise ValueError("Reference role is not supported")
        if source is not None and len(source) > 500:
            raise ValueError("Reference source must be 500 characters or fewer")

        try:
            media_type, extension, media_info = self._inspect_image(
                data, self.max_image_dimension, self.max_image_pixels
            )
        except UnsupportedReferenceError:
            try:
                media_type, extension, media_info = self._inspect_audio(data)
            except UnsupportedReferenceError as audio_error:
                raise UnsupportedReferenceError(
                    "Upload must be a supported image or audio file"
                ) from audio_error

        reference_id = str(uuid4())
        now = time.time()
        original_filename = self._safe_original_filename(filename)
        storage_name = f"original.{extension}"
        asset_directory = self.project_directory(project_id) / "references" / reference_id
        asset_directory.mkdir(parents=True, exist_ok=False)
        asset_path = asset_directory / storage_name
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                project_row = self._get_project_row(connection, project_id)
                with asset_path.open("xb") as asset_file:
                    asset_file.write(data)
                    asset_file.flush()
                    os.fsync(asset_file.fileno())
                connection.execute(
                    """
                    INSERT INTO project_assets
                    (id, project_id, original_filename, storage_name, media_type,
                     media_format, size_bytes, sha256, role, source, media_info_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        reference_id,
                        project_id,
                        original_filename,
                        storage_name,
                        media_type,
                        media_info["format"],
                        len(data),
                        hashlib.sha256(data).hexdigest(),
                        role,
                        source,
                        json.dumps(media_info),
                        now,
                    ),
                )
                project = self._project_from_row(project_row)
                project["updated_at"] = now
                references = self._list_references(connection, project_id)
                self._write_project_files(project, references)
                connection.execute(
                    "UPDATE projects SET updated_at = ? WHERE id = ?",
                    (now, project_id),
                )
        except Exception:
            self._remove_failed_creation(asset_directory)
            raise

        return {
            "id": reference_id,
            "project_id": project_id,
            "original_filename": original_filename,
            "media_type": media_type,
            "media_format": extension,
            "size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "role": role,
            "source": source,
            "media_info": media_info,
            "created_at": now,
        }

    def list_references(self, project_id: str) -> List[Dict[str, Any]]:
        project_id = self._canonical_id(project_id)
        with self._connection() as connection:
            self._get_project_row(connection, project_id)
            return self._list_references(connection, project_id)

    def get_reference(self, project_id: str, reference_id: str) -> Dict[str, Any]:
        project_id = self._canonical_id(project_id)
        try:
            reference_id = str(UUID(reference_id))
        except (ValueError, TypeError, AttributeError) as error:
            raise ReferenceNotFoundError("Reference not found") from error
        with self._connection() as connection:
            self._get_project_row(connection, project_id)
            row = connection.execute(
                "SELECT * FROM project_assets WHERE id = ? AND project_id = ?",
                (reference_id, project_id),
            ).fetchone()
            if row is None:
                raise ReferenceNotFoundError("Reference not found")
            return self._reference_from_row(row)

    def reference_content_path(self, project_id: str, reference_id: str) -> Path:
        reference = self.get_reference(project_id, reference_id)
        with self._connection() as connection:
            row = connection.execute(
                "SELECT storage_name FROM project_assets WHERE id = ? AND project_id = ?",
                (reference["id"], reference["project_id"]),
            ).fetchone()
            if row is None:
                raise ReferenceNotFoundError("Reference not found")
        path = (
            self.project_directory(project_id)
            / "references"
            / reference["id"]
            / row["storage_name"]
        ).resolve()
        expected_parent = (
            self.project_directory(project_id) / "references" / reference["id"]
        ).resolve()
        if path.parent != expected_parent or not path.is_file():
            raise ReferenceNotFoundError("Reference content not found")
        return path

    def delete_reference(self, project_id: str, reference_id: str) -> None:
        project_id = self._canonical_id(project_id)
        try:
            reference_id = str(UUID(reference_id))
        except (ValueError, TypeError, AttributeError) as error:
            raise ReferenceNotFoundError("Reference not found") from error
        asset_directory = self.project_directory(project_id) / "references" / reference_id
        now = time.time()
        trash_path = None
        try:
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                project_row = self._get_project_row(connection, project_id)
                row = connection.execute(
                    "SELECT 1 FROM project_assets WHERE id = ? AND project_id = ?",
                    (reference_id, project_id),
                ).fetchone()
                if row is None:
                    raise ReferenceNotFoundError("Reference not found")
                trash_path = self._move_to_trash(asset_directory, reference_id)
                connection.execute(
                    "DELETE FROM project_assets WHERE id = ? AND project_id = ?",
                    (reference_id, project_id),
                )
                project = self._project_from_row(project_row)
                project["updated_at"] = now
                references = self._list_references(connection, project_id)
                self._write_project_files(project, references)
                connection.execute(
                    "UPDATE projects SET updated_at = ? WHERE id = ?",
                    (now, project_id),
                )
        except Exception:
            self._restore_from_trash(trash_path, asset_directory)
            raise
        self._purge_trash(trash_path)

    def export_project_bundle(self, project_id: str) -> bytes:
        project = self.get_project(project_id)
        references = self.list_references(project_id)
        editor_state = self.get_editor_state(project_id)
        if len(references) > self.MAX_BUNDLE_REFERENCES:
            raise ProjectBundleInvalidError("Project contains too many references to bundle")
        bundle_manifest = {
            "format_version": 2,
            "project": project,
            "references": references,
            "editor_state": (
                {
                    "size_bytes": len(editor_state),
                    "sha256": hashlib.sha256(editor_state).hexdigest(),
                }
                if editor_state is not None
                else None
            ),
        }
        manifest_data = json.dumps(
            bundle_manifest, ensure_ascii=False, indent=2
        ).encode("utf-8")
        uncompressed_size = len(manifest_data) + sum(
            reference["size_bytes"] for reference in references
        )
        if editor_state is not None:
            uncompressed_size += len(editor_state)
        if uncompressed_size > self.max_bundle_bytes:
            raise ProjectBundleInvalidError("Project bundle exceeds the configured size limit")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", manifest_data)
            for reference in references:
                content_path = self.reference_content_path(project_id, reference["id"])
                archive.write(
                    content_path,
                    f"references/{reference['id']}/{content_path.name}",
                )
            if editor_state is not None:
                archive.writestr("editor-state.yjs", editor_state)
        bundle = buffer.getvalue()
        if len(bundle) > self.max_bundle_bytes:
            raise ProjectBundleInvalidError("Project bundle exceeds the configured size limit")
        return bundle

    def import_project_bundle(self, bundle: bytes) -> Dict[str, Any]:
        if not bundle or len(bundle) > self.max_bundle_bytes:
            raise ProjectBundleInvalidError("Project bundle is empty or exceeds the size limit")
        try:
            archive = zipfile.ZipFile(io.BytesIO(bundle))
        except (OSError, zipfile.BadZipFile) as error:
            raise ProjectBundleInvalidError("Project bundle is not a valid ZIP archive") from error

        with archive:
            entries = archive.infolist()
            if not entries or len(entries) > self.MAX_BUNDLE_REFERENCES + 2:
                raise ProjectBundleInvalidError("Project bundle contains an invalid number of files")
            names = set()
            total_uncompressed_bytes = 0
            for entry in entries:
                path = PurePosixPath(entry.filename)
                mode = entry.external_attr >> 16
                if (
                    entry.filename in names
                    or path.is_absolute()
                    or "\\" in entry.filename
                    or ".." in path.parts
                    or entry.is_dir()
                    or (mode & 0o170000) == 0o120000
                    or entry.flag_bits & 0x1
                ):
                    raise ProjectBundleInvalidError("Project bundle contains an unsafe or duplicate path")
                names.add(entry.filename)
                total_uncompressed_bytes += entry.file_size
                if total_uncompressed_bytes > self.max_bundle_bytes:
                    raise ProjectBundleInvalidError("Project bundle expands beyond the configured size limit")

            if "manifest.json" not in names:
                raise ProjectBundleInvalidError("Project bundle is missing manifest.json")
            manifest_info = archive.getinfo("manifest.json")
            if manifest_info.file_size > 4 * 1024 * 1024:
                raise ProjectBundleInvalidError("Project bundle manifest is too large")
            try:
                manifest_data = archive.read("manifest.json")
                manifest = json.loads(manifest_data)
            except (KeyError, UnicodeDecodeError, json.JSONDecodeError, zipfile.BadZipFile) as error:
                raise ProjectBundleInvalidError("Project bundle manifest is invalid") from error

            if (
                not isinstance(manifest, dict)
                or manifest.get("format_version") not in {1, 2}
                or not isinstance(manifest.get("project"), dict)
                or not isinstance(manifest.get("references"), list)
            ):
                raise ProjectBundleInvalidError("Project bundle manifest has an unsupported format")
            format_version = manifest["format_version"]
            if format_version == 2 and "editor_state" not in manifest:
                raise ProjectBundleInvalidError("Project bundle is missing editor-state metadata")
            editor_state = None
            if format_version == 2 and manifest["editor_state"] is not None:
                state_info = manifest["editor_state"]
                if not isinstance(state_info, dict):
                    raise ProjectBundleInvalidError("Editor-state metadata in the bundle is invalid")
                state_size = state_info.get("size_bytes")
                state_sha256 = state_info.get("sha256")
                if (
                    not isinstance(state_size, int)
                    or isinstance(state_size, bool)
                    or state_size <= 0
                    or state_size > self.max_editor_state_bytes
                    or not isinstance(state_sha256, str)
                    or len(state_sha256) != 64
                    or any(character not in "0123456789abcdef" for character in state_sha256.lower())
                ):
                    raise ProjectBundleInvalidError("Editor-state metadata in the bundle is invalid")
                if "editor-state.yjs" not in names:
                    raise ProjectBundleInvalidError("Project bundle is missing editor state")
                if archive.getinfo("editor-state.yjs").file_size != state_size:
                    raise ProjectBundleInvalidError("Editor-state size does not match the manifest")
                try:
                    editor_state = archive.read("editor-state.yjs")
                except (KeyError, zipfile.BadZipFile) as error:
                    raise ProjectBundleInvalidError("Editor state in the bundle is corrupt") from error
                if (
                    len(editor_state) != state_size
                    or hashlib.sha256(editor_state).hexdigest() != state_sha256
                ):
                    raise ProjectBundleInvalidError("Editor-state checksum does not match the manifest")
            project = manifest["project"]
            if (
                not isinstance(project.get("name"), str)
                or not project["name"].strip()
                or not isinstance(project.get("description", ""), str)
                or not isinstance(project.get("tags", []), list)
                or not all(isinstance(tag, str) for tag in project.get("tags", []))
                or not isinstance(project.get("config", {}), dict)
            ):
                raise ProjectBundleInvalidError("Project metadata in the bundle is invalid")
            references = manifest["references"]
            if len(references) > self.MAX_BUNDLE_REFERENCES:
                raise ProjectBundleInvalidError("Project bundle contains too many references")

            content_entries = names - {"manifest.json"}
            reference_payloads = []
            expected_entries = set()
            if editor_state is not None:
                expected_entries.add("editor-state.yjs")
            reference_ids = set()
            image_extensions = {
                extension for _, extension in self.IMAGE_FORMATS.values()
            }
            audio_extensions = {
                extension for _, extension in self.AUDIO_FORMATS.values()
            }
            for reference in references:
                if not isinstance(reference, dict):
                    raise ProjectBundleInvalidError("Reference metadata in the bundle is invalid")
                try:
                    reference_id = str(UUID(reference["id"]))
                    if not isinstance(reference["media_format"], str):
                        raise ValueError
                    media_format = reference["media_format"].lower()
                    if not isinstance(reference["original_filename"], str):
                        raise ValueError
                    original_filename = self._safe_original_filename(reference["original_filename"])
                    media_type = reference["media_type"]
                    role = reference.get("role")
                    source = reference.get("source")
                    expected_size = reference["size_bytes"]
                    expected_sha256 = reference["sha256"]
                    if (
                        media_type not in {"image", "audio"}
                        or role is not None and role not in self.REFERENCE_ROLES
                        or source is not None and (not isinstance(source, str) or len(source) > 500)
                        or not isinstance(expected_size, int)
                        or isinstance(expected_size, bool)
                        or expected_size <= 0
                        or expected_size > self.max_upload_bytes
                        or not isinstance(expected_sha256, str)
                        or len(expected_sha256) != 64
                        or any(character not in "0123456789abcdef" for character in expected_sha256.lower())
                    ):
                        raise ValueError
                except (KeyError, TypeError, ValueError) as error:
                    raise ProjectBundleInvalidError("Reference metadata in the bundle is invalid") from error

                valid_extensions = (
                    image_extensions if media_type == "image" else audio_extensions
                )
                if media_format not in valid_extensions or reference_id in reference_ids:
                    raise ProjectBundleInvalidError("Reference format in the bundle is unsupported")
                reference_ids.add(reference_id)
                archive_name = f"references/{reference_id}/original.{media_format}"
                expected_entries.add(archive_name)
                if archive_name not in names:
                    raise ProjectBundleInvalidError("Project bundle is missing reference content")
                if archive.getinfo(archive_name).file_size != expected_size:
                    raise ProjectBundleInvalidError("Reference content size does not match the manifest")
                try:
                    data = archive.read(archive_name)
                except (KeyError, zipfile.BadZipFile) as error:
                    raise ProjectBundleInvalidError("Reference content in the bundle is corrupt") from error
                if (
                    len(data) != expected_size
                    or hashlib.sha256(data).hexdigest() != expected_sha256
                ):
                    raise ProjectBundleInvalidError("Reference content checksum does not match the manifest")
                reference_payloads.append((original_filename, data, role, source))

            if expected_entries != content_entries:
                raise ProjectBundleInvalidError("Project bundle contains unexpected files")

        created_project = self.create_project(
            project["name"],
            project.get("description", ""),
            project.get("tags", []),
            project.get("config", {}),
        )
        try:
            for filename, data, role, source in reference_payloads:
                self.create_reference(
                    created_project["id"],
                    filename,
                    data,
                    role=role,
                    source=source,
                )
            if editor_state is not None:
                self.save_editor_state(created_project["id"], editor_state)
        except Exception as error:
            try:
                self.delete_project(created_project["id"])
            except Exception as cleanup_error:
                logger.exception("Could not clean up incomplete imported project %s", created_project["id"])
                raise RuntimeError(
                    "Project import failed and partial-project cleanup was incomplete"
                ) from cleanup_error
            if isinstance(error, (ReferenceTooLargeError, UnsupportedReferenceError)):
                raise ProjectBundleInvalidError(
                    "Project bundle contains invalid or unsupported reference content"
                ) from error
            raise
        return self.get_project(created_project["id"])


def create_project_asset_service(settings: Any) -> ProjectAssetService:
    return ProjectAssetService(
        projects_path=settings.PROJECTS_PATH,
        max_upload_bytes=settings.REFERENCE_MAX_UPLOAD_BYTES,
        max_image_dimension=settings.REFERENCE_MAX_IMAGE_DIMENSION,
        max_image_pixels=settings.REFERENCE_MAX_IMAGE_PIXELS,
        max_audio_seconds=settings.REFERENCE_MAX_AUDIO_SECONDS,
        max_bundle_bytes=settings.PROJECT_BUNDLE_MAX_BYTES,
    )


project_asset_service = create_project_asset_service(settings)
