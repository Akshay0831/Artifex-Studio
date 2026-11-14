from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4
from services.project_asset_service import (
    ProjectNotFoundError,
    ProjectBundleInvalidError,
    ReferenceTooLargeError,
    ReferenceNotFoundError,
    ReferenceProcessingUnavailableError,
    UnsupportedReferenceError,
    project_asset_service,
)

router = APIRouter(prefix="/projects", tags=["projects"])

# Request/Response Models
class ProjectRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    tags: List[str]
    config: Dict[str, Any]
    created_at: float
    updated_at: float

class BatchRequest(BaseModel):
    operations: List[Dict[str, Any]]


@router.post("", response_model=ProjectResponse)
async def create_project(request: ProjectRequest):
    """Create a new project"""
    project = project_asset_service.create_project(
        request.name,
        request.description or "",
        request.tags,
        request.config,
    )
    return ProjectResponse(**project)

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get project details"""
    try:
        return ProjectResponse(**project_asset_service.get_project(project_id))
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, request: ProjectRequest):
    """Update project details"""
    try:
        project = project_asset_service.update_project(
            project_id,
            request.name,
            request.description or "",
            request.tags,
            request.config,
        )
        return ProjectResponse(**project)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete a project"""
    try:
        project_asset_service.delete_project(project_id)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    return {"message": "Project deleted successfully"}

@router.get("")
async def list_projects():
    """List all projects"""
    projects = project_asset_service.list_projects()
    return {"projects": projects, "total": len(projects)}

@router.get("/{project_id}/bundle")
async def export_project_bundle(project_id: str):
    try:
        bundle = project_asset_service.export_project_bundle(project_id)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ProjectBundleInvalidError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    return Response(
        content=bundle,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="artifex-project-{project_id}.zip"'},
    )


@router.post("/bundle", status_code=201, response_model=ProjectResponse)
async def import_project_bundle(file: UploadFile = File(...)):
    bundle = await file.read(project_asset_service.max_bundle_bytes + 1)
    if len(bundle) > project_asset_service.max_bundle_bytes:
        raise HTTPException(status_code=413, detail="Project bundle exceeds the configured size limit")
    try:
        project = project_asset_service.import_project_bundle(bundle)
    except ProjectBundleInvalidError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ReferenceProcessingUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return ProjectResponse(**project)


@router.post("/{project_id}/references", status_code=201)
async def upload_reference(
    project_id: str,
    file: UploadFile = File(...),
    role: Optional[Literal["style", "composition", "subject", "palette"]] = Form(None),
    source: Optional[str] = Form(None, max_length=500),
):
    """Store a validated image or audio reference for a project."""
    data = await file.read(project_asset_service.max_upload_bytes + 1)
    if len(data) > project_asset_service.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Reference file exceeds the configured byte limit")
    try:
        return project_asset_service.create_reference(
            project_id,
            file.filename,
            data,
            role=role,
            source=source,
        )
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ReferenceTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except ReferenceProcessingUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except UnsupportedReferenceError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error


@router.get("/{project_id}/references")
async def list_references(project_id: str):
    try:
        references = project_asset_service.list_references(project_id)
        return {"references": references, "total": len(references)}
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@router.get("/{project_id}/references/{reference_id}")
async def get_reference(project_id: str, reference_id: str):
    try:
        return project_asset_service.get_reference(project_id, reference_id)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ReferenceNotFoundError as error:
        raise HTTPException(status_code=404, detail="Reference not found") from error


@router.get("/{project_id}/references/{reference_id}/content")
async def get_reference_content(project_id: str, reference_id: str):
    try:
        reference = project_asset_service.get_reference(project_id, reference_id)
        path = project_asset_service.reference_content_path(project_id, reference_id)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ReferenceNotFoundError as error:
        raise HTTPException(status_code=404, detail="Reference not found") from error
    return FileResponse(
        path,
        media_type=reference["media_info"]["content_type"],
        filename=reference["original_filename"],
        content_disposition_type="inline",
    )


@router.delete("/{project_id}/references/{reference_id}")
async def delete_reference(project_id: str, reference_id: str):
    try:
        project_asset_service.delete_reference(project_id, reference_id)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ReferenceNotFoundError as error:
        raise HTTPException(status_code=404, detail="Reference not found") from error
    return {"message": "Reference deleted successfully"}

@router.post("/batch")
async def submit_batch_operations(request: BatchRequest):
    """Submit batch operations for processing"""
    try:
        batch_id = str(uuid4())
        
        # Process batch operations
        results = []
        for operation in request.operations:
            operation_type = operation.get("type")
            params = operation.get("params", {})
            
            try:
                if operation_type == "create":
                    project = await create_project(ProjectRequest(**params))
                    results.append({"status": "success", "result": project.model_dump()})
                elif operation_type == "update":
                    project_id = params.get("project_id")
                    if project_id:
                        project = await update_project(project_id, ProjectRequest(**params))
                        results.append({"status": "success", "result": project.model_dump()})
                    else:
                        results.append({"status": "error", "error": "Project not found"})
                else:
                    results.append({"status": "error", "error": f"Unknown operation type: {operation_type}"})
            except Exception as e:
                results.append({"status": "error", "error": str(e)})
        
        return {
            "batch_id": batch_id,
            "status": "completed",
            "total_operations": len(request.operations),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))