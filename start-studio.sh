#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
elif [[ -x "$ROOT_DIR/.venv/Scripts/python.exe" ]]; then
    PYTHON_CMD="$ROOT_DIR/.venv/Scripts/python.exe"
else
    echo "ERROR: Project virtual environment not found. Run the setup script first." >&2
    exit 1
fi

if ! "$PYTHON_CMD" -c 'import sys; raise SystemExit(0 if (3, 9) <= sys.version_info[:2] < (3, 13) else 1)'; then
    echo "ERROR: Artifex Studio alpha requires Python 3.9 through 3.12." >&2
    exit 1
fi

if [[ ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
    echo "ERROR: Production frontend is missing. Run the setup script to build it." >&2
    exit 1
fi

echo "Starting Artifex Studio at http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."
exec "$PYTHON_CMD" "$ROOT_DIR/backend/app.py"
