#!/usr/bin/env python3
"""Install the alpha runtime and build the frontend."""

import platform
import shutil
import subprocess
import sys
from pathlib import Path


class SetupScript:
    MIN_PYTHON = (3, 9)
    MAX_PYTHON_EXCLUSIVE = (3, 13)

    def __init__(self):
        self.platform = platform.system()
        self.setup_path = Path(__file__).resolve().parent

    def log(self, message, level="INFO"):
        print(f"[{level}] {message}")

    def check_python(self):
        version = sys.version_info[:2]
        self.log(f"Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro} found")
        if not self.MIN_PYTHON <= version < self.MAX_PYTHON_EXCLUSIVE:
            raise RuntimeError(
                "The alpha build supports Python 3.9 through 3.12. "
                "Python 3.13 is not supported by the current dependency constraints."
            )

    @property
    def venv_path(self):
        return self.setup_path / ".venv"

    @property
    def venv_python(self):
        if self.platform == "Windows":
            return self.venv_path / "Scripts" / "python.exe"
        return self.venv_path / "bin" / "python"

    def create_virtual_environment(self):
        if self.venv_path.exists():
            if not self.venv_python.is_file():
                raise RuntimeError(
                    f"Existing virtual environment is incomplete: {self.venv_path}"
                )
            result = subprocess.run(
                [
                    str(self.venv_python),
                    "-c",
                    "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            expected = f"{sys.version_info.major}.{sys.version_info.minor}"
            if result.stdout.strip() != expected:
                raise RuntimeError(
                    f"Existing virtual environment uses Python {result.stdout.strip()}, "
                    f"but setup is running Python {expected}. Recreate .venv with the "
                    "supported interpreter before installing."
                )
            return

        self.log("Creating virtual environment...")
        subprocess.run(
            [sys.executable, "-m", "venv", str(self.venv_path)],
            check=True,
            cwd=self.setup_path,
        )
        if not self.venv_python.is_file():
            raise RuntimeError("Python did not create the expected virtual environment.")

    def install_dependencies(self):
        requirements = self.setup_path / "backend" / "release_requirements.txt"
        if not requirements.is_file():
            raise RuntimeError(f"Backend requirements file not found: {requirements}")
        self.log("Installing backend release dependencies...")
        subprocess.run(
            [
                str(self.venv_python),
                "-m",
                "pip",
                "install",
                "-r",
                str(requirements),
            ],
            check=True,
            cwd=self.setup_path,
        )

    def check_frontend_prerequisites(self):
        frontend_path = self.setup_path / "frontend"
        if not (frontend_path / "package-lock.json").is_file():
            raise RuntimeError("Frontend package-lock.json is missing.")
        if not shutil.which("npm"):
            raise RuntimeError("Node.js and npm are required to build the alpha frontend.")

    def setup_frontend(self):
        frontend_path = self.setup_path / "frontend"
        npm = shutil.which("npm")
        if not npm:
            raise RuntimeError("Node.js and npm are required to build the alpha frontend.")

        self.log("Installing locked frontend dependencies...")
        subprocess.run([npm, "ci"], check=True, cwd=frontend_path)
        self.log("Building production frontend...")
        subprocess.run([npm, "run", "build"], check=True, cwd=frontend_path)
        if not (frontend_path / "dist" / "index.html").is_file():
            raise RuntimeError("Frontend build completed without producing dist/index.html.")

    def run_setup(self):
        print("=" * 60)
        print("Artifex Studio - Alpha Setup")
        print("=" * 60)
        try:
            self.check_python()
            self.check_frontend_prerequisites()
            self.create_virtual_environment()
            self.install_dependencies()
            self.setup_frontend()
        except subprocess.CalledProcessError as error:
            self.log(
                f"Command failed with exit code {error.returncode}: {error.cmd}",
                "ERROR",
            )
            return False
        except (OSError, RuntimeError) as error:
            self.log(str(error), "ERROR")
            return False

        print("\nAlpha setup completed successfully.")
        print("Start with start-studio.bat on Windows or run `bash start-studio.sh` on macOS/Linux.")
        print("Open http://127.0.0.1:8000 after the server starts.")
        return True


if __name__ == "__main__":
    sys.exit(0 if SetupScript().run_setup() else 1)
