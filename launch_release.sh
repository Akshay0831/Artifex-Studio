#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -x "$ROOT_DIR/.venv/bin/python" || ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
    PYTHON_CMD=""
    for candidate in python3.12 python3.11 python3.10 python3.9 python3; do
        if command -v "$candidate" >/dev/null 2>&1 &&
            "$candidate" -c 'import sys; raise SystemExit(0 if (3, 9) <= sys.version_info[:2] < (3, 13) else 1)' 2>/dev/null; then
            PYTHON_CMD="$candidate"
            break
        fi
    done
    if [[ -z "$PYTHON_CMD" ]]; then
        echo "ERROR: Python 3.9 through 3.12 is required to prepare the alpha environment." >&2
        exit 1
    fi
    "$PYTHON_CMD" "$ROOT_DIR/setup.py"
fi

exec "$ROOT_DIR/start-studio.sh"
