import os
import platform
import sys
from pathlib import Path


def _default_data_dir() -> Path:
    configured = os.environ.get("ARTIFEX_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()

    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "ArtifexStudio"


def configure_runtime() -> None:
    if getattr(sys, "frozen", False):
        bundle_root = Path(getattr(sys, "_MEIPASS"))
        version_file = bundle_root / "ARTIFEX_VERSION"
        if version_file.is_file():
            os.environ["ARTIFEX_VERSION"] = version_file.read_text(encoding="utf-8").strip()

        data_dir = _default_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        os.chdir(data_dir)
        for key, subdirectory in (
            ("DATA_PATH", ""),
            ("PROJECTS_PATH", "projects"),
            ("CONFIGS_PATH", "config"),
            ("OUTPUT_PATH", "output"),
            ("MODELS_PATH", "models"),
            ("STUDIO_ROOT", ""),
        ):
            os.environ.setdefault(key, str(data_dir / subdirectory))


def main() -> None:
    configure_runtime()
    import uvicorn

    from app import app
    from config.config import settings

    print(f"Artifex Studio {app.version}")
    print(f"Open http://{settings.SERVER_HOST}:{settings.SERVER_PORT} in your browser.")
    uvicorn.run(
        app,
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
