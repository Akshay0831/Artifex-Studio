import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
APP_DIR = DIST / "ArtifexStudio"
GITHUB_RELEASE_ASSET_LIMIT_BYTES = 2 * 1024**3


def _validate_release_asset_size(size_bytes: int) -> None:
    if size_bytes >= GITHUB_RELEASE_ASSET_LIMIT_BYTES:
        raise ValueError(
            f"Release asset is {size_bytes} bytes; GitHub requires each asset "
            f"to be smaller than {GITHUB_RELEASE_ASSET_LIMIT_BYTES} bytes (2 GiB)."
        )


def _platform_slug() -> str:
    system = {"darwin": "macos"}.get(platform.system().lower(), platform.system().lower())
    architecture = platform.machine().lower()
    architecture = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64"}.get(
        architecture, architecture
    )
    return f"{system}-{architecture}"


def _smoke_test(executable: Path, version: str, timeout: int) -> None:
    port = 8765
    with tempfile.TemporaryDirectory(prefix="artifex-smoke-") as data_dir:
        environment = os.environ.copy()
        environment.update(
            {
                "ARTIFEX_DATA_DIR": data_dir,
                "SERVER_HOST": "127.0.0.1",
                "SERVER_PORT": str(port),
            }
        )
        environment.pop("PYTHONHOME", None)
        environment.pop("PYTHONPATH", None)

        with tempfile.TemporaryFile() as logs:
            process = subprocess.Popen(
                [str(executable.resolve())],
                cwd=executable.parent,
                env=environment,
                stdout=logs,
                stderr=subprocess.STDOUT,
            )
            deadline = time.monotonic() + timeout
            try:
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        logs.seek(0)
                        output = logs.read().decode("utf-8", errors="replace")
                        raise RuntimeError(
                            f"Packaged app exited with code {process.returncode}:\n{output[-4000:]}"
                        )
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}", timeout=3) as response:
                            if response.status != 200 or b"<html" not in response.read().lower():
                                raise RuntimeError("Packaged app did not serve its frontend.")
                        with urllib.request.urlopen(
                            f"http://127.0.0.1:{port}/api/health", timeout=3
                        ) as response:
                            health = json.loads(response.read())
                        if health.get("version") != version:
                            raise RuntimeError(
                                f"Packaged version {health.get('version')!r} "
                                f"does not match {version!r}."
                            )
                        if not all(
                            (Path(data_dir) / name).is_dir()
                            for name in ("projects", "config", "output", "models")
                        ):
                            raise RuntimeError("Packaged app did not create its user data folders.")
                        print(f"Packaged app smoke test passed: {version}")
                        return
                    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                        time.sleep(1)
                logs.seek(0)
                output = logs.read().decode("utf-8", errors="replace")
                raise TimeoutError(
                    f"Packaged app did not become healthy within {timeout} seconds:\n{output[-4000:]}"
                )
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


def build_release(version: str, timeout: int) -> Path:
    if not version or any(character in version for character in "/\\"):
        raise ValueError("Version must be a non-empty filename-safe value.")
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        raise FileNotFoundError("Build frontend/dist before packaging.")

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--onedir",
        "--console",
        "--name",
        "ArtifexStudio",
        "--paths",
        str(ROOT / "backend"),
        "--distpath",
        str(DIST),
        "--workpath",
        str(ROOT / "build" / "pyinstaller"),
        "--add-data",
        f"{ROOT / 'frontend' / 'dist'}{os.pathsep}frontend/dist",
    ]
    for package in ("torch", "diffusers", "transformers", "librosa"):
        command.extend(["--collect-all", package])
    for module in (
        "extensions.art_extension",
        "extensions.audio_extension",
        "extensions.project_extension",
        "cv2",
        "mido",
        "soundfile",
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ):
        command.extend(["--hidden-import", module])
    command.extend(
        [
            "--exclude-module",
            "pytest",
            "--exclude-module",
            "IPython",
            "--exclude-module",
            "notebook",
            str(ROOT / "backend" / "desktop_launcher.py"),
        ]
    )
    subprocess.run(command, cwd=ROOT, check=True)
    executable = APP_DIR / (
        "ArtifexStudio.exe" if platform.system() == "Windows" else "ArtifexStudio"
    )
    if not executable.is_file():
        raise FileNotFoundError(f"PyInstaller did not produce the executable: {executable}")

    runtime_dir = APP_DIR / "_internal"
    if not runtime_dir.is_dir():
        runtime_dir = APP_DIR
    (runtime_dir / "ARTIFEX_VERSION").write_text(version + "\n", encoding="utf-8")
    _smoke_test(executable, version, timeout)

    archive = DIST / f"ArtifexStudio-v{version}-{_platform_slug()}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for path in APP_DIR.rglob("*"):
            if path.is_file():
                output.write(path, Path(APP_DIR.name) / path.relative_to(APP_DIR))
    _validate_release_asset_size(archive.stat().st_size)
    print(f"Created {archive}")
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and smoke-test a native alpha bundle.")
    parser.add_argument("--version", required=True)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    build_release(args.version, args.timeout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
