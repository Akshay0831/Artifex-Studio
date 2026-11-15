"""
Configuration Manager API Routes
Handles multi-environment configuration management
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from config_manager import config_manager
import time

router = APIRouter(prefix="/config", tags=["config"])

# Request/Response Models
class EnvironmentRequest(BaseModel):
    environment: str
    config: Dict[str, Any]

class EnvironmentResponse(BaseModel):
    success: bool
    message: str
    environment: str
    config: Dict[str, Any]

class ConfigValidationRequest(BaseModel):
    environment: str
    config: Dict[str, Any]

@router.get("/environments", response_model=List[str])
async def get_environments():
    """Get list of all available environments."""
    try:
        environments = config_manager.list_environments()
        return environments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/current", response_model=Dict[str, Any])
async def get_current_environment():
    """Get current environment configuration."""
    try:
        current_env = config_manager.get_current_environment()
        config = config_manager.get_config()
        validation = config_manager.validate_environment(current_env)
        
        return {
            "success": True,
            "environment": current_env,
            "config": config,
            "validation": validation,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/set", response_model=Dict[str, Any])
async def set_environment(
    environment: str = Query(..., description="Environment name to set")
):
    """Set current environment."""
    try:
        success = config_manager.set_environment(environment)
        
        if success:
            config = config_manager.get_config()
            validation = config_manager.validate_environment(environment)
            
            return {
                "success": True,
                "message": f"Switched to {environment} environment",
                "environment": environment,
                "config": config,
                "validation": validation,
                "timestamp": time.time()
            }
        else:
            raise HTTPException(status_code=400, detail=f"Environment {environment} not found")
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {environment}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/env/{env_name}", response_model=Dict[str, Any])
async def get_environment_config(
    env_name: str,
    path: str = Query(None, description="Specific config path (e.g., 'server.port')")
):
    """Get configuration for a specific environment."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        
        if path:
            config_value = config_manager.get_config(env_enum, path)
            if config_value is None:
                raise HTTPException(status_code=404, detail=f"Config path '{path}' not found")
            
            return {
                "success": True,
                "environment": env_name,
                "path": path,
                "value": config_value,
                "timestamp": time.time()
            }
        else:
            config = config_manager.get_config(env_enum)
            validation = config_manager.validate_environment(env_enum)
            
            return {
                "success": True,
                "environment": env_name,
                "config": config,
                "validation": validation,
                "timestamp": time.time()
            }
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/env/{env_name}", response_model=Dict[str, Any])
async def update_environment_config(
    env_name: str,
    path: str = Query(..., description="Config path to update (e.g., 'server.port')"),
    value: Any = Query(..., description="New value for the config")
):
    """Update configuration value for a specific environment."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        
        # Convert string values to appropriate types
        if isinstance(value, str):
            # Try to parse as JSON for complex values
            try:
                import json
                value = json.loads(value)
            except:
                # Keep as string if not valid JSON
                pass
        
        config_manager.set_config(env_enum, path, value)
        
        # Get updated config
        config = config_manager.get_config(env_enum)
        validation = config_manager.validate_environment(env_enum)
        
        return {
            "success": True,
            "message": f"Updated {path} in {env_name} environment",
            "environment": env_name,
            "path": path,
            "new_value": value,
            "config": config,
            "validation": validation,
            "timestamp": time.time()
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/env/{env_name}/validate", response_model=Dict[str, Any])
async def validate_environment_config(
    env_name: str,
    config_data: Optional[Dict[str, Any]] = None
):
    """Validate environment configuration."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        
        if config_data is not None:
            validation = config_manager.validate_configuration(config_data, env_enum)
        else:
            # Validate current config
            validation = config_manager.validate_environment(env_enum)
        
        return {
            "success": True,
            "environment": env_name,
            "validation": validation,
            "timestamp": time.time()
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/env/{env_name}/create", response_model=Dict[str, Any])
async def create_custom_environment(
    env_name: str,
    base_env: str = Query("development", description="Base environment to copy from")
):
    """Create a custom environment based on an existing one."""
    try:
        result = config_manager.create_custom_environment(env_name, base_env)
        
        if result["success"]:
            return {
                "success": True,
                **result,
                "timestamp": time.time()
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/env/{env_name}", response_model=Dict[str, Any])
async def delete_custom_environment(env_name: str):
    """Delete a custom environment."""
    try:
        result = config_manager.delete_custom_environment(env_name)
        
        if result["success"]:
            return {
                "success": True,
                **result,
                "timestamp": time.time()
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/env/{env_name}/export", response_model=Dict[str, Any])
async def export_environment_config(env_name: str):
    """Export environment configuration."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        result = config_manager.export_configuration(env_enum)
        
        if result["success"]:
            return {
                "success": True,
                **result,
                "timestamp": time.time()
            }
        else:
            raise HTTPException(status_code=404, detail=result["error"])
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/env/{env_name}/import", response_model=Dict[str, Any])
async def import_environment_config(
    env_name: str,
    config_data: Dict[str, Any]
):
    """Import environment configuration."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        result = config_manager.import_configuration(env_enum, config_data)
        
        if result["success"]:
            return {
                "success": True,
                **result,
                "timestamp": time.time()
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/env/{env_name}/sections", response_model=List[str])
async def get_config_sections(env_name: str):
    """Get configuration sections for an environment."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        config = config_manager.get_config(env_enum)
        
        if not isinstance(config, dict):
            return []
        
        sections = list(config.keys())
        return sections
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/env/{env_name}/section/{section}", response_model=Dict[str, Any])
async def get_config_section(
    env_name: str,
    section: str
):
    """Get a specific configuration section."""
    try:
        env_enum = config_manager.resolve_environment(env_name)
        section_config = config_manager.get_config(env_enum, section)
        
        if section_config is None:
            raise HTTPException(status_code=404, detail=f"Section '{section}' not found")
        
        return {
            "success": True,
            "environment": env_name,
            "section": section,
            "config": section_config,
            "timestamp": time.time()
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid environment name: {env_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Special endpoints for common config sections
@router.get("/server", response_model=Dict[str, Any])
async def get_server_config():
    """Get server configuration for current environment."""
    try:
        current_env = config_manager.get_current_environment()
        server_config = config_manager.get_server_config(current_env)
        
        return {
            "success": True,
            "environment": current_env,
            "config": server_config,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/database", response_model=Dict[str, Any])
async def get_database_config():
    """Get database configuration for current environment."""
    try:
        current_env = config_manager.get_current_environment()
        database_url = config_manager.get_database_url(current_env)
        database_config = config_manager.get_config(current_env, "database")
        
        return {
            "success": True,
            "environment": current_env,
            "database_url": database_url,
            "config": database_config,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ai", response_model=Dict[str, Any])
async def get_ai_config():
    """Get AI configuration for current environment."""
    try:
        current_env = config_manager.get_current_environment()
        ai_config = config_manager.get_ai_config(current_env)
        
        return {
            "success": True,
            "environment": current_env,
            "config": ai_config,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/security", response_model=Dict[str, Any])
async def get_security_config():
    """Get security configuration for current environment."""
    try:
        current_env = config_manager.get_current_environment()
        security_config = config_manager.get_security_config(current_env)
        
        return {
            "success": True,
            "environment": current_env,
            "config": security_config,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage", response_model=Dict[str, Any])
async def get_storage_config():
    """Get storage configuration for current environment."""
    try:
        current_env = config_manager.get_current_environment()
        storage_config = config_manager.get_storage_config(current_env)
        
        return {
            "success": True,
            "environment": current_env,
            "config": storage_config,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))