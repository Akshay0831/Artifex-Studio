# Artifex Studio

Artifex Studio is a local-first creative studio with a React/TypeScript frontend and FastAPI backend. It combines image editing and generation workflows with audio composition tools; provider/model availability depends on the configured backend and is not guaranteed by the UI alone.

## Key Capabilities
- **Image Editing**: Canvas editing, generation controls, and post-generation palette/color-limit options
- **Projects and References**: Edit local project metadata, store image/audio references, preview originals, and import/export portable project bundles
- **Audio Tools**: Multi-track editing foundations; audio generation currently reports unavailable because no production composition backend is configured
- **Provider Integration**: Optional cloud profiles and local Ollama/LM Studio text-model profiles
- **Cross-Platform**: Native support for Windows, macOS, and Linux
- **Persistence**: Project metadata, editor state, and validated reference files stored locally
- **Web Interface**: Modern React frontend with Tailwind CSS UI

## Features

- **Palette constraints**: Fixed palettes, maximum color counts, extracted output palettes, dithering, and alpha preservation
- **Reference palettes**: Extract a bounded palette from an explicitly selected image reference and apply it as fixed post-generation colors; the source image is not sent to the model
- **Project metadata**: Create projects and edit their names, descriptions, and tags in either editor sidebar
- **Portable projects**: Export/import bundles containing project metadata, original reference assets, and per-project Yjs editor state
- **Local references**: Image/audio references can be uploaded, previewed, and reused from the Art and Audio sidebars
- **Local text models**: Discover installed Ollama or LM Studio models, configure a loopback endpoint and temperature, and use the selected model for Art prompt refinement

## Workspace appearance and layout
- Theme mode (light, dark, or system), accent, spacing, density, corner radius, and motion settings are persisted locally and configured together in **Theme Settings**. The setting controls the studio theme tokens, spacing utilities, and rem-based sizing; some feature-specific styles still need further tokenization.
- The controls, editor, and history/activity panels can be dragged between left, center, and right docks, stacked as tabs, collapsed, and resized. Their arrangement and widths persist in browser storage; **Reset panel layout** restores the default workspace. Art/Audio control sections and activity sections can also be reordered or collapsed. Labels disappear when a panel is too narrow to show them, with full names available through tooltips and accessibility labels.
- Ollama and LM Studio profiles discover installed models from loopback runtimes and currently support text inference only. Selecting a local profile enables real text-model refinement of Art prompts; without one, the existing prompt expander only appends built-in style terms. Local models do not generate or condition images, compose audio, or analyze references. Audio text-model workflows remain future work.
- The frontend uses same-origin HTTP and WebSocket requests by default (including the Vite development proxy); set `VITE_API_BASE_URL` or `VITE_WS_URL` only to use a separate backend origin. Image/audio generation requires the backend WebSocket transport. The status indicator distinguishes an available HTTP health endpoint from a disconnected/missing WebSocket runtime.

> **Capability status:** Project sharing/authorization, reference-conditioned image generation, audio-reference analysis/MIDI extraction, and training are not implemented. Audio composition currently returns an explicit unavailable error; no placeholder output is reported as generated audio.

## 📦 Installation

### Quick Start
Each successful push to `main` triggers backend tests, frontend checks, native bundle builds, and packaged-app smoke tests. Passing runs publish numbered `v0.1.0-alpha.N` GitHub prereleases. `dev` runs validation only; manually dispatching this workflow on `dev` creates downloadable workflow artifacts but no release.

1. Download the Windows, Linux, or macOS ZIP from the [GitHub prereleases](https://github.com/Akshay0831/Artifex-Studio/releases) page.
2. Extract it into a user-writable folder and launch `ArtifexStudio.exe` on Windows or `ArtifexStudio` on macOS/Linux.
3. Open **http://127.0.0.1:8000** in your browser.

The bundles are unsigned portable application folders, not installers. Python and Node.js are not required to run them. Model weights and provider credentials are not bundled; see [Alpha limitations](#alpha-limitations).
The Linux alpha bundle uses CPU-only PyTorch to stay below GitHub's per-file release limit; CUDA acceleration is not included in that bundle.

### Build from source
1. Clone the repository.
2. Install Python 3.9–3.12 and Node.js/npm.
3. Run the platform setup script:
   - **Windows**: `setup-windows.bat`
   - **macOS**: `bash setup-macos.sh`
   - **Linux**: `bash setup-linux.sh`
4. Start the app:
   - **Windows**: `start-studio.bat`
   - **macOS/Linux**: `bash start-studio.sh`
5. Open **http://127.0.0.1:8000**. Do not open the built `index.html` directly.

### Requirements
- Python 3.9–3.12; Python 3.13 is not supported by the current NumPy constraint
- Node.js and npm (Node.js 20 is used in CI)
- Network access on first setup to install dependencies

## 🎯 Getting Started

1. Run setup once, then start the application using the platform launcher.
2. Open **http://127.0.0.1:8000**; the backend serves the production frontend build.
3. API documentation is available at **http://127.0.0.1:8000/docs**.

### Alpha limitations
- Audio composition currently returns an explicit unavailable error; no production music-generation backend is configured.
- Audio-reference analysis, MIDI transcription, reference-conditioned image/audio generation, multi-user sharing/authorization, and training are not implemented.
- Local model support is limited to Ollama/LM Studio text inference for Art prompt refinement; local image generation and text-to-audio composition are not implemented.
- Scene-context extraction is also unavailable; the UI reports that state rather than returning sample metadata.
- Generation requests fail visibly when the WebSocket backend is disconnected. In-flight generation cannot currently be cancelled; the UI warns that server work may continue.
- API and local-model profiles are currently held in backend memory and are cleared when the backend restarts; profile persistence is not implemented.
- Image palette limits are applied to generated output; they do not condition the model or derive palettes from stored references.
- Editor state is autosaved by the local backend for the selected project and included in project bundles; without a selected project it is not persisted. Real-time multi-user collaboration is not implemented.
- Local project storage is not permission-controlled. Do not expose the server to an untrusted network.
- Native alpha bundles are unsigned and may trigger operating-system security warnings. Extract them to a user-writable location; project data is stored in the user's application-data directory.

## Project Structure

```
artifex-studio/
├── frontend/         # React/TypeScript frontend
├── backend/          # Python backend with AI services
├── backend/         # FastAPI services and tests
├── frontend/        # React/TypeScript application
├── scripts/         # Deployment and utility scripts
├── docs/            # Project documentation
└── data/            # Runtime project, model, and output data
```

## Development

The project consists of a React/TypeScript frontend and Python backend.

### Frontend Setup
```bash
cd frontend
npm ci
npm run dev
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python app.py
```

The frontend development server runs on port 3000 and the backend on port 8000. For source installs, run `python setup.py` from the repository root, then use the platform launcher above. Native release bundles are published on the GitHub prereleases page after a successful `main` workflow.

### Alpha validation
```bash
cd backend
python -m compileall -q .
python -m pytest tests
cd ../frontend
npm ci
npm run build
```



## Contributing

Contributions are welcome.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---
