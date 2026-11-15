import json
import logging
import time
import zipfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config.config import Settings

logger = logging.getLogger("studio.backend.routes.exports")
settings = Settings()
router = APIRouter(prefix="/exports", tags=["exports"])


# Request/Response Models
class ExportRequest(BaseModel):
    format: str  # png, jpeg, gif, svg, webp, zip
    quality: Optional[int] = 85
    scale: Optional[int] = 1
    background: Optional[str] = "transparent"
    layers: Optional[List[str]] = []
    animation_frames: Optional[int] = 1

class ExportResponse(BaseModel):
    format: str
    files: List[dict]
    count: int
    download_url: str
    size: Optional[int] = None
    metadata: Optional[dict] = None

@router.post("/{project_id}/{format}")
async def export_project(
    project_id: str,
    format: str,
    export_request: ExportRequest
):
    """Package project files matching the requested format into a downloadable ZIP."""
    try:
        if format.lower() != export_request.format.lower():
            raise HTTPException(
                status_code=422,
                detail="The path format must match the request format",
            )

        projects_root = Path(settings.PROJECTS_PATH).resolve()
        project_dir = (projects_root / project_id).resolve()
        if not project_dir.is_relative_to(projects_root):
            raise HTTPException(status_code=400, detail="Invalid project id")
        if not project_dir.is_dir():
            raise HTTPException(status_code=404, detail="Project not found")

        timestamp = time.time_ns()
        export_root = (Path(settings.OUTPUT_PATH) / "exports").resolve()
        export_path = (export_root / f"{project_id}_export_{timestamp}").resolve()
        if not export_path.is_relative_to(export_root):
            raise HTTPException(status_code=400, detail="Invalid project id")
        project_files = [path for path in project_dir.rglob("*") if path.is_file()]
        if export_request.format.lower() != "zip":
            supported_formats = {
                item.strip().lower().lstrip(".")
                for item in export_request.format.split(",")
                if item.strip()
            }
            project_files = [
                path for path in project_files
                if path.suffix.lower().lstrip(".") in supported_formats
            ]
            if not project_files:
                raise HTTPException(
                    status_code=422,
                    detail="No project files match the requested export format",
                )

        export_path.mkdir(parents=True, exist_ok=True)
        zip_path = export_path / f"{project_id}_export_{timestamp}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for file_path in project_files:
                archive.write(file_path, file_path.relative_to(project_dir))
            metadata = {
                "project_id": project_id,
                "export_config": export_request.model_dump(),
                "timestamp": timestamp,
                "format": export_request.format,
                "total_files": len(project_files),
            }
            archive.writestr("metadata.json", json.dumps(metadata, indent=2))

        file_metadata = [
            {
                "name": file_path.name,
                "size": file_path.stat().st_size,
                "path": str(file_path.relative_to(project_dir)),
                "format": file_path.suffix.lower().lstrip("."),
            }
            for file_path in project_files
        ]
        return ExportResponse(
            format=export_request.format,
            files=file_metadata,
            count=len(project_files),
            download_url=f"/api/exports/download/{project_id}_{timestamp}",
            size=zip_path.stat().st_size,
            metadata=metadata,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Project export failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{project_id}_{timestamp}")
async def download_export(project_id: str, timestamp: str):
    """Download export files"""
    try:
        exports_root = (Path(settings.OUTPUT_PATH) / "exports").resolve()
        export_path = (
            exports_root / f"{project_id}_export_{timestamp}"
        ).resolve()
        if not export_path.is_relative_to(exports_root):
            raise HTTPException(status_code=400, detail="Invalid export id")
        if not export_path.is_dir():
            raise HTTPException(status_code=404, detail="Export not found")

        zip_file = export_path / f"{project_id}_export_{timestamp}.zip"
        if not zip_file.is_file():
            raise HTTPException(status_code=404, detail="Export archive not found")
        return FileResponse(
            path=str(zip_file),
            filename=zip_file.name,
            media_type="application/zip",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Export download failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def list_exports():
    """List all exports"""
    exports_dir = Path(settings.OUTPUT_PATH) / "exports"
    if not exports_dir.exists():
        return {"exports": [], "total": 0}
    
    exports = []
    for export_dir in exports_dir.iterdir():
        if export_dir.is_dir():
            exports.append({
                "name": export_dir.name,
                "path": str(export_dir),
                "created_at": export_dir.stat().st_ctime,
                "files": len(list(export_dir.rglob('*')))
            })
    
    return {"exports": exports, "total": len(exports)}