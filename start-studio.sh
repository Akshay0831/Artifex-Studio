#!/bin/bash
# Unified Editing Studio - Robust Cross-Platform Launcher

set -o errexit  # Exit on error
set -o nounset  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# Function to print error and exit
error_exit() {
    echo "ERROR: $1" >&2
    echo ""
    if [ $# -gt 1 ]; then
        echo "Troubleshooting suggestions:"
        shift
        while [ $# -gt 0 ]; do
            echo "  - $1"
            shift
        done
    fi
    echo ""
    read -p "Press Enter to exit..."
    exit 1
}

# Function to print success message
success_message() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo ""
}

# Function to get absolute path
get_absolute_path() {
    if command -v realpath >/dev/null 2>&1; then
        realpath "$1"
    elif command -v readlink >/dev/null 2>&1 && command -v dirname >/dev/null 2>&1; then
        dirname "$(readlink -f "$1")"
    else
        echo "$(cd "$(dirname "$1")" && pwd 2>/dev/null || echo "$(dirname "$1")")"
    fi
}

# Function to detect platform
detect_platform() {
    if command -v uname >/dev/null 2>&1; then
        local uname_output=$(uname)
        case "$uname_output" in
            Linux)
                echo "linux"
                ;;
            Darwin)
                echo "macos"
                ;;
            CYGWIN*|MSYS*|MINGW*)
                echo "windows"
                ;;
            *)
                echo "unknown"
                ;;
        esac
    else
        echo "unknown"
    fi
}

# Function to check port availability
check_port() {
    local port="$1"
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -tln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -i :"$port" >/dev/null 2>&1; then
            return 1  # Port is in use
        fi
    fi
    return 0  # Port is available
}

# Get script directory with comprehensive fallbacks
SCRIPT_DIR=""
if command -v dirname >/dev/null 2>&1 && command -v pwd >/dev/null 2>&1; then
    SCRIPT_DIR="$(get_absolute_path "${BASH_SOURCE[0]}")"
elif [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="$(get_absolute_path "${BASH_SOURCE[0]}")"
else
    SCRIPT_DIR="$(pwd 2>/dev/null || echo ".")"
    echo "Warning: Could not determine script directory accurately, using: $SCRIPT_DIR"
fi

# Change to script directory
cd "$SCRIPT_DIR" || error_exit "Could not change to script directory: $SCRIPT_DIR"

# Detect platform
PLATFORM=$(detect_platform)
echo "Detected platform: $PLATFORM"

# System information
echo "System information:"
if command -v uname >/dev/null 2>&1; then
    echo "  - Kernel: $(uname -s)"
    echo "  - Architecture: $(uname -m)"
fi

if command -v free >/dev/null 2>&1; then
    echo "  - Available Memory: $(( $(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}' || echo '0') / 1024 ))MB"
elif [ "$(uname -s)" = "Darwin" ]; then
    echo "  - Available Memory: $(( $(vm_stat | grep 'Pages free:' | awk '{print $3}' * 4) ))MB"
fi

echo ""
echo "========================================"
echo "Unified Editing Studio - Launcher"
echo "========================================"
echo ""

# Check if virtual environment exists
if [[ ! -d "$SCRIPT_DIR/.venv" ]]; then
    error_exit "Virtual environment not found at $SCRIPT_DIR/.venv" \
        "Please run setup first:" \
        "  - macOS: ./setup-macos.sh" \
        "  - Linux: ./setup-linux.sh" \
        "  - Windows: setup-windows.bat"
fi

# Find Python interpreter with comprehensive detection
PYTHON_CMD=""
PYTHON_VERSION=""
PYTHON_MIN_VERSION="3.9"

# Try different Python executables in order of preference
python_candidates=(
    "python3"
    "python"
    "python3.13"
    "python3.12"
    "python3.11"
    "python3.10"
    "python3.9"
    "$SCRIPT_DIR/.venv/bin/python"
    "$SCRIPT_DIR/.venv/bin/python3"
    "/usr/bin/python3"
    "/usr/local/bin/python3"
    "/opt/homebrew/bin/python3"  # macOS Homebrew
    "/usr/bin/python"
    "/usr/local/bin/python"
    "/opt/python3/bin/python3"
    "/opt/python/bin/python"
)

for candidate in "${python_candidates[@]}"; do
    if command -v "$candidate" >/dev/null 2>&1; then
        # Test if it's actually Python and get version
        if "$candidate" --version >/dev/null 2>&1; then
            PYTHON_CMD="$candidate"
            PYTHON_VERSION=$("$candidate" --version 2>&1 | awk '{print $2}' | sed 's/Python //')
            
            # Check version requirement
            if python3 -c "import sys; exit(0 if tuple(map(int, '$PYTHON_VERSION'.split('.'))) >= tuple(map(int, '$PYTHON_MIN_VERSION'.split('.'))) else 1)" 2>/dev/null; then
                echo "Found Python: $PYTHON_CMD (version $PYTHON_VERSION)"
                break
            else
                echo "Python version $PYTHON_VERSION found but $PYTHON_MIN_VERSION+ required, trying alternatives..."
                PYTHON_CMD=""
            fi
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    error_exit "No compatible Python interpreter found" \
        "Install Python 3.9+ using your system package manager" \
        "Make sure Python is in your PATH environment variable" \
        "Virtual environment might be corrupted - try running setup again"
fi

# Check for required application files
echo "Checking application components..."
missing_components=()

if [ ! -f "backend/app.py" ]; then
    missing_components+=("backend/app.py")
fi

if [ ! -d "frontend" ]; then
    echo "WARNING: Frontend directory not found"
fi

if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo "Frontend found: frontend/dist/index.html"
else
    echo "WARNING: Frontend not built or not found"
    echo "You may need to run: cd frontend && npm install && npm run build"
fi

# Check port availability
if check_port 8000; then
    echo "Port 8000 is available"
else
    echo "WARNING: Port 8000 appears to be in use"
    echo "Another application might be running on http://localhost:8000"
fi

if [ ${#missing_components[@]} -gt 0 ]; then
    error_exit "Missing required components: ${missing_components[*]}" \
        "Make sure you ran the setup script first" \
        "Check that all files are present in the correct locations"
fi

# Check if backend can be imported
echo ""
echo "Testing backend application..."
if ! "$PYTHON_CMD" -c "import sys; sys.path.insert(0, 'backend'); import app; print('Backend import successful')" 2>/dev/null; then
    echo "WARNING: Backend application has import issues"
    echo "The application might still run, but some features could be broken"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
if [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
    echo "Virtual environment activated"
elif [[ -f ".venv/Scripts/activate" ]]; then
    source .venv/Scripts/activate
    echo "Virtual environment activated"
else
    echo "WARNING: Could not find virtual environment activate script"
    echo "Will use system Python installation"
fi

echo "Using Python: $PYTHON_CMD"
echo "Python executable: $("$PYTHON_CMD" -c "import sys; print(sys.executable)")"

# Set environment variables
export PYTHONPATH="${SCRIPT_DIR}/backend:${PYTHONPATH:-}"
export FLASK_APP="${SCRIPT_DIR}/backend/app.py"
export FLASK_ENV="${FLASK_ENV:-development}"

success_message "Starting Unified Editing Studio..."

# Display startup information
echo ""
echo "========================================"
echo "Application Information"
echo "========================================"
echo "Backend: http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
if [ -f "frontend/dist/index.html" ]; then
    echo "Frontend: Open ${SCRIPT_DIR}/frontend/dist/index.html"
else
    echo "Frontend: Run 'cd frontend && npm install && npm run build' then open dist/index.html"
fi
echo "Platform: $PLATFORM"
echo "Python: $PYTHON_VERSION"
echo "Virtual Environment: $([ -n "${VIRTUAL_ENV:-}" ] && echo "Yes" || echo "No")"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the application with logging
echo "Starting backend application..."
echo "Log file: ${SCRIPT_DIR}/server.log"
echo ""

# Check if we should run in background or foreground
if [ "${BACKGROUND:-false}" = "true" ]; then
    # Run in background
    nohup "$PYTHON_CMD" backend/app.py > "${SCRIPT_DIR}/server.log" 2>&1 &
    SERVER_PID=$!
    echo "Server started in background with PID: $SERVER_PID"
    echo "To stop: kill $SERVER_PID"
    echo "To view logs: tail -f ${SCRIPT_DIR}/server.log"
    exit 0
else
    # Run in foreground
    exec "$PYTHON_CMD" backend/app.py
fi