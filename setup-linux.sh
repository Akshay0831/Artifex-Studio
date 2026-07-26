#!/bin/bash
# Unified Editing Studio - Robust Linux Setup
# This script sets up the application on Linux systems with comprehensive error handling

set -o errexit  # Exit on error
set -o nounset  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

echo "========================================"
echo "Unified Editing Studio - Linux Setup"
echo "========================================"
echo ""
echo "This script will set up the Unified Editing Studio"
echo "on your Linux system."
echo ""

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
    echo "Next steps:"
    echo "1. Run ./start-studio.sh to launch the application"
    echo "2. Backend will be available at: http://localhost:8000"
    echo "3. Frontend: Open frontend/dist/index.html"
    echo "4. API documentation: http://localhost:8000/docs"
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

# Get script directory with fallbacks
SCRIPT_DIR=""
if command -v dirname >/dev/null 2>&1 && command -v pwd >/dev/null 2>&1; then
    SCRIPT_DIR="$(get_absolute_path "$0")"
    cd "$SCRIPT_DIR" || error_exit "Could not change to script directory: $SCRIPT_DIR"
elif [ -f "$0" ]; then
    SCRIPT_DIR="$(get_absolute_path "$0")"
    cd "$SCRIPT_DIR" || error_exit "Could not change to script directory: $SCRIPT_DIR"
else
    echo "Warning: Could not determine script directory, using current directory"
    SCRIPT_DIR="$(pwd)"
fi

echo "Working directory: $SCRIPT_DIR"
echo ""

# Check for Python interpreter with comprehensive detection
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
    "/usr/bin/python3"
    "/usr/bin/python"
    "/usr/local/bin/python3"
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
            echo "Found Python: $PYTHON_CMD (version $PYTHON_VERSION)"
            
            # Check version requirement
            if ! python3 -c "import sys; exit(0 if tuple(map(int, '$PYTHON_VERSION'.split('.'))) >= tuple(map(int, '$PYTHON_MIN_VERSION'.split('.'))) else 1)" 2>/dev/null; then
                echo "WARNING: Python version $PYTHON_VERSION found, but $PYTHON_MIN_VERSION+ is recommended"
            fi
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    error_exit "No Python interpreter found" \
        "Install Python 3.9+ using your system package manager:" \
        "  - Debian/Ubuntu: sudo apt update && sudo apt install python3.9 python3-pip" \
        "  - RedHat/Fedora: sudo dnf install python3.9 python3-pip" \
        "  - Arch Linux: sudo pacman -S python python-pip" \
        "  - From source: https://python.org"
fi

# Check for required system tools
required_tools=("curl" "tar")
for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "WARNING: $tool command not found - some features might be limited"
    fi
done

# Check if running as root (not recommended for Python packages)
if [ "$(id -u)" = "0" ]; then
    echo "WARNING: Running as root is not recommended"
    echo "It's better to run setup as a regular user"
    echo "If you want to continue, press Enter, otherwise Ctrl+C to cancel"
    read
fi

# Check if setup.py exists
if [ ! -f "setup.py" ]; then
    error_exit "setup.py not found in $SCRIPT_DIR" \
        "Make sure you are running this script from the correct directory" \
        "The setup.py file should be in the same directory as this script"
fi

# Check disk space (minimum 1GB)
available_space=$(df -k . | awk 'NR==2 {print $4}')
required_space=$((1024 * 1024))  # 1GB in KB
if [ "$available_space" -lt "$required_space" ]; then
    echo "WARNING: Low disk space available. Setup might fail."
    echo "Available space: $((available_space / 1024))MB"
    echo "Recommended: At least 1GB free space"
    
    # Check if we can continue
    echo "Press Enter to continue anyway, or Ctrl+C to cancel"
    read
fi

# Check if this is a fresh setup or upgrade
if [ -d ".venv" ]; then
    echo "Existing virtual environment found"
    echo "This will upgrade dependencies in the existing environment"
    echo "Press Enter to continue, or Ctrl+C to cancel"
    read
fi

echo ""
echo "Starting setup with $PYTHON_CMD..."
echo "Setup log will be shown below:"
echo ""

# Run setup with error handling
if ! "$PYTHON_CMD" setup.py; then
    echo ""
    error_exit "Setup failed with exit code $?" \
        "Check the error messages above" \
        "Make sure you have internet connection for downloading packages" \
        "Try running: $PYTHON_CMD -m pip install --upgrade pip" \
        "Try running: $PYTHON_CMD setup.py --help" \
        "If using a virtual environment, make sure it's properly activated" \
        "Check system logs: dmesg | tail or journalctl -xe"
else
    success_message "Setup completed successfully!"
    
    # Check if application can start
    if [ -f ".venv/bin/activate" ] || [ -f ".venv/Scripts/activate" ]; then
        echo "Virtual environment created successfully."
    else
        echo "Virtual environment check: Not detected (might be system-wide installation)"
    fi
    
    if [ -f "backend/app.py" ]; then
        echo "Backend application found: backend/app.py"
    else
        echo "WARNING: Backend application not found at backend/app.py"
    fi
    
    # Check system resources
    echo ""
    echo "System information:"
    echo "  - Operating System: $(uname -s)"
    echo "  - Architecture: $(uname -m)"
    echo "  - Available Memory: $(( $(grep MemAvailable /proc/meminfo | awk '{print $2}') / 1024 ))MB"
    echo ""
    
    read -p "Press Enter to continue..."
    exit 0
fi"