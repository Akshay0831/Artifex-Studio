#!/usr/bin/env python3
"""
Unified Editing Studio - Setup Script
Single installation script for all platforms
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path

class SetupScript:
    def __init__(self):
        self.platform = platform.system()
        self.setup_path = Path(__file__).parent
        
    def log(self, message, level="INFO"):
        print(f"[{level}] {message}")
        
    def check_python(self):
        """Check Python installation"""
        try:
            version = sys.version_info
            self.log(f"Python {version.major}.{version.minor}.{version.micro} found")
            
            if version.major < 3 or (version.major == 3 and version.minor < 9):
                self.log("WARNING: Python 3.9+ recommended", "WARNING")
                
            return True
        except Exception as e:
            self.log(f"Python check failed: {e}", "ERROR")
            return False
    
    def create_virtual_environment(self):
        """Create Python virtual environment"""
        try:
            venv_path = self.setup_path / ".venv"
            
            if not venv_path.exists():
                self.log("Creating virtual environment...")
                subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)
                self.log("Virtual environment created successfully")
            else:
                self.log("Virtual environment already exists")
                
            # Test virtual environment
            if self.platform == "Windows":
                venv_python = venv_path / "Scripts" / "python.exe"
            else:
                venv_python = venv_path / "bin" / "python"
            
            subprocess.run([str(venv_python), "--version"], check=True)
            return True
            
        except Exception as e:
            self.log(f"Virtual environment creation failed: {e}", "ERROR")
            return False
    
    def install_dependencies(self):
        """Install all dependencies"""
        try:
            if self.platform == "Windows":
                venv_python = self.setup_path / ".venv" / "Scripts" / "python.exe"
            else:
                venv_python = self.setup_path / ".venv" / "bin" / "python"
            
            # Upgrade pip
            self.log("Upgrading pip...")
            subprocess.run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"], check=True)
            
            # Install basic dependencies
            self.log("Installing basic dependencies...")
            basic_deps = [
                "fastapi==0.104.1",
                "uvicorn[standard]==0.24.0", 
                "python-multipart==0.0.6",
                "pydantic>=2.5.0,<3.0.0",
                "Pillow>=10.1.0",
                "httpx>=0.25.2",
                "python-dotenv>=1.0.0"
            ]
            
            for dep in basic_deps:
                self.log(f"Installing {dep}...")
                subprocess.run([str(venv_python), "-m", "pip", "install", dep], check=True)
            
            # Install additional dependencies
            self.log("Installing additional dependencies...")
            additional_deps = [
                "aiohttp",
                "redis", 
                "aiocache"
            ]
            
            for dep in additional_deps:
                try:
                    self.log(f"Installing {dep}...")
                    subprocess.run([str(venv_python), "-m", "pip", "install", dep], check=True)
                except subprocess.CalledProcessError:
                    self.log(f"Failed to install {dep}, continuing anyway...", "WARNING")
            
            # Install AI dependencies (optional)
            self.log("Installing AI dependencies...")
            ai_deps = [
                "torch>=2.1.0",
                "torchvision>=0.16.0",
                "torchaudio>=2.1.0",
                "diffusers>=0.25.0",
                "transformers>=4.35.0",
                "accelerate>=0.25.0"
            ]
            
            for dep in ai_deps:
                try:
                    self.log(f"Installing {dep}...")
                    subprocess.run([str(venv_python), "-m", "pip", "install", dep], check=True)
                except subprocess.CalledProcessError:
                    self.log(f"Failed to install {dep}, continuing without AI features...", "WARNING")
            
            self.log("Dependencies installed successfully")
            return True
            
        except Exception as e:
            self.log(f"Dependency installation failed: {e}", "ERROR")
            return False
    
    def setup_frontend(self):
        """Setup frontend components"""
        try:
            frontend_path = self.setup_path / "frontend"
            
            if not frontend_path.exists():
                self.log("Frontend directory not found", "WARNING")
                return True
            
            self.log("Setting up frontend...")
            
            # Check if npm is available
            npm_found = False
            npm_cmd = None
            
            if self.platform == "Windows":
                npm_paths = ["npm", "npm.cmd", "C:\\Program Files\\nodejs\\npm.cmd", "C:\\Program Files (x86)\\nodejs\\npm.cmd"]
            else:
                npm_paths = ["npm", "/usr/local/bin/npm"]
            
            for npm_path in npm_paths:
                try:
                    subprocess.run([npm_path, "--version"], capture_output=True, check=True)
                    npm_found = True
                    npm_cmd = npm_path
                    break
                except (subprocess.CalledProcessError, FileNotFoundError):
                    continue
            
            if not npm_found:
                self.log("npm not found, skipping frontend setup", "WARNING")
                return True
            
            self.log(f"Using npm: {npm_cmd}")
            
            # Install dependencies
            self.log("Installing frontend dependencies...")
            os.chdir(frontend_path)
            subprocess.run([npm_cmd, "install"], check=True)
            os.chdir(self.setup_path)
            
            # Build frontend
            self.log("Building frontend...")
            os.chdir(frontend_path)
            subprocess.run([npm_cmd, "run", "build"], check=True)
            os.chdir(self.setup_path)
            
            self.log("Frontend setup completed")
            return True
            
        except Exception as e:
            self.log(f"Frontend setup failed: {e}", "WARNING")
            return True  # Continue even if frontend fails
    
    def create_launchers(self):
        """Create platform-specific launchers"""
        try:
            self.log("Creating launchers...")
            
            if self.platform == "Windows":
                self.create_windows_launchers()
            else:
                self.create_unix_launchers()
            
            self.log("Launchers created successfully")
            return True
            
        except Exception as e:
            self.log(f"Launcher creation failed: {e}", "ERROR")
            return False
    
    def create_windows_launchers(self):
        """Create Windows launchers"""
        # Main launcher
        launcher_content = f"""@echo off
cd /d "{self.setup_path}"
call .venv\\Scripts\\activate
echo Starting Unified Editing Studio...
python backend\\app.py
pause
"""
        
        with open("start.bat", "w") as f:
            f.write(launcher_content)
        
        # Quick launcher (without dependency check)
        quick_content = f"""@echo off
cd /d "{self.setup_path}"
call .venv\\Scripts\\activate
python backend\\app.py
pause
"""
        
        with open("quickstart.bat", "w") as f:
            f.write(quick_content)
        
        # Service launcher
        service_content = f"""@echo off
cd /d "{self.setup_path}"
call .venv\\Scripts\\activate
echo Starting Unified Editing Studio as a service...
echo Backend: http://localhost:8000
echo Frontend: Open index.html in frontend/dist directory
echo.
python backend\\app.py
pause
"""
        
        with open("service.bat", "w") as f:
            f.write(service_content)
    
    def create_unix_launchers(self):
        """Create Unix launchers"""
        # Main launcher
        launcher_content = f"""#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
echo "Starting Unified Editing Studio..."
python backend/app.py
"""
        
        with open("start.sh", "w") as f:
            f.write(launcher_content)
        
        # Quick launcher
        quick_content = f"""#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python backend/app.py
"""
        
        with open("quickstart.sh", "w") as f:
            f.write(quick_content)
        
        # Make scripts executable
        os.chmod("start.sh", 0o755)
        os.chmod("quickstart.sh", 0o755)
    
    def run_setup(self):
        """Run the complete setup process"""
        print("=" * 60)
        print("Unified Editing Studio - Setup")
        print("=" * 60)
        
        try:
            # Check Python
            if not self.check_python():
                raise Exception("Python 3.9+ is required")
            
            # Create virtual environment
            if not self.create_virtual_environment():
                raise Exception("Failed to create virtual environment")
            
            # Install dependencies
            if not self.install_dependencies():
                raise Exception("Failed to install dependencies")
            
            # Setup frontend
            self.setup_frontend()
            
            # Create launchers
            if not self.create_launchers():
                raise Exception("Failed to create launchers")
            
            print("\n" + "=" * 60)
            print("Setup completed successfully!")
            print("=" * 60)
            print("\nTo start the application:")
            print(f"  Windows: Run 'start.bat'")
            print(f"  Unix: Run './start.sh'")
            print("\nThe application will be available at:")
            print("  Backend: http://localhost:8000")
            print("  Frontend: Open frontend/dist/index.html")
            print("\nFor quick startup, use 'quickstart.bat/sh'")
            
        except Exception as e:
            print(f"\nSetup failed: {e}")
            print("Please check the error messages above and try again.")
            return False
        
        return True

if __name__ == "__main__":
    setup = SetupScript()
    setup.run_setup()