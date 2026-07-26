# Artifex Studio

Artifex Studio - A unified AI-powered creative studio combining real-time image and audio editing capabilities with direct AI model integration. Built with a React/TypeScript frontend and Python backend featuring FastAPI, PyTorch, and AI/ML libraries for creative workflows.

## Key Capabilities
- **AI Image Generation**: Real-time sprite and art generation with multiple AI models (Stable Diffusion, DALL-E, custom trained models)
- **Audio Production**: Multi-track audio composition, editing, and sound generation
- **Direct AI Integration**: Seamless connection to multiple AI generation services and APIs
- **Real-Time Editing**: Canvas-based manipulation for both visual and audio content
- **Cross-Platform**: Native support for Windows, macOS, and Linux
- **Model Management**: Dynamic model loading and scaling with Redis caching
- **Web Interface**: Modern React frontend with Tailwind CSS UI

## Features

- **AI Image Generation**: Real-time sprite and art generation with various AI models
- **Audio Production**: Multi-track audio composition and editing tools
- **Direct AI Integration**: Seamless connection to multiple AI generation services and APIs
- **Real-Time Editing**: Canvas-based manipulation for both visual and audio content
- **Cross-Platform**: Native support for Windows, macOS, and Linux

## 📦 Installation

### Quick Start
1. **Download the latest release** from [GitHub](https://github.com/Akshay0831/Artifex-Studio)
2. **Extract to your desired location**
3. **Run the setup**:
   - **Windows**: Run `setup-windows.bat` then `start-studio.bat`
   - **macOS**: Run `setup-macos.sh` then `start-studio.sh`
   - **Linux**: Run `setup-linux.sh` then `start-studio.sh`

### Requirements
- Python 3.9+ with pip

## 🎯 Getting Started

1. **Launch the Application**: Run the setup script, then launch with the start script
2. **Configure AI Models**: Set up your preferred AI generation services through the web interface
3. **Start Creating**: Use the AI-powered tools for content generation
4. **Access Applications**: 
   - **Backend API**: http://localhost:8000
   - **API Documentation**: http://localhost:8000/docs
   - **Frontend**: Open `frontend/dist/index.html` in browser

## Project Structure

```
artifex-studio/
├── frontend/         # React/TypeScript frontend
├── backend/          # Python backend with AI services
├── installer/       # Simplified installation scripts
├── config/          # Configuration files
├── data/            # Models and output storage
├── scripts/         # Deployment and utility scripts
└── local-tools/     # Validation and testing tools
```

## Development

The project consists of a React/TypeScript frontend and Python backend.

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Running Both
```bash
# First setup (one-time)
python setup.py

# Then launch both
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000 &
cd frontend && npm run dev
```



## Contributing

Contributions are welcome.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

Created by Akshay R