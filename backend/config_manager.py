import json
import logging
import re
import copy
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from enum import Enum

logger = logging.getLogger("studio.backend.config_manager")

class Environment(Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


def _environment_name(env: Union[Environment, str]) -> str:
    name = env.value if isinstance(env, Environment) else env
    normalized = name.strip().lower()
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", normalized):
        raise ValueError(f"Invalid environment name: {name}")
    return normalized


class ConfigManager:
    def __init__(self, environments_root: Optional[Path] = None):
        self.environments_root = environments_root or Path("config/environments")
        self.current_environment = Environment.DEVELOPMENT.value
        self.config_cache: Dict[str, Dict[str, Any]] = {}
        
        # Create environments directory if it doesn't exist
        self.environments_root.mkdir(parents=True, exist_ok=True)
        
        # Load environment configurations
        self._load_all_environments()

    def _load_all_environments(self):
        """Load all environment configurations."""
        self.config_cache = {}
        
        for env in Environment:
            name = env.value
            config_file = self.environments_root / f"{name}.json"
            if config_file.exists():
                try:
                    with open(config_file, 'r', encoding='utf-8') as f:
                        self.config_cache[name] = json.load(f)
                    logger.info(f"Loaded {name} configuration")
                except Exception as e:
                    logger.error(f"Failed to load {name} config: {e}")
                    self.config_cache[name] = {}
            else:
                # Create default configuration
                self.config_cache[name] = self._get_default_config(env)
                self._save_environment_config(name)

        built_in_names = {env.value for env in Environment}
        for config_file in self.environments_root.glob("*.json"):
            name = config_file.stem.lower()
            if name in built_in_names:
                continue
            try:
                name = _environment_name(name)
                with config_file.open('r', encoding='utf-8') as file:
                    config = json.load(file)
                if not isinstance(config, dict):
                    raise ValueError("configuration root must be a JSON object")
                self.config_cache[name] = config
                logger.info("Loaded custom %s configuration", name)
            except (OSError, json.JSONDecodeError, ValueError) as error:
                logger.error("Failed to load custom environment config %s: %s", config_file, error)

    def _get_default_config(self, env: Environment) -> Dict[str, Any]:
        """Get default configuration for environment."""
        base_config = {
            "server": {
                "host": "0.0.0.0",
                "port": 8000,
                "debug": True,
                "reload": True,
                "workers": 1
            },
            "database": {
                "url": "sqlite:///studio.db",
                "pool_size": 5,
                "timeout": 30
            },
            "ai": {
                "model_path": "models",
                "cache_dir": "cache",
                "max_concurrent_requests": 4,
                "request_timeout": 300,
                "batch_size": 1,
                "precision": "float16"
            },
            "monitoring": {
                "enabled": True,
                "metrics_port": 8080,
                "log_level": "INFO",
                "health_check_interval": 30
            },
            "security": {
                "rate_limit": {
                    "enabled": True,
                    "requests_per_minute": 100,
                    "burst_size": 10
                },
                "cors": {
                    "enabled": True,
                    "allow_origins": ["*"],
                    "allow_methods": ["*"],
                    "allow_headers": ["*"]
                }
            },
            "storage": {
                "max_file_size": 100 * 1024 * 1024,  # 100MB
                "allowed_extensions": [".png", ".jpg", ".jpeg", ".gif", ".mp3", ".wav", ".json"],
                "temp_dir": "temp",
                "cleanup_interval": 3600  # 1 hour
            }
        }
        
        # Environment-specific overrides
        if env == Environment.DEVELOPMENT:
            base_config["server"]["debug"] = True
            base_config["server"]["reload"] = True
            base_config["monitoring"]["log_level"] = "DEBUG"
            base_config["security"]["rate_limit"]["enabled"] = False
            
        elif env == Environment.STAGING:
            base_config["server"]["debug"] = False
            base_config["server"]["reload"] = False
            base_config["server"]["workers"] = 2
            base_config["monitoring"]["log_level"] = "INFO"
            base_config["security"]["rate_limit"]["requests_per_minute"] = 200
            
        elif env == Environment.PRODUCTION:
            base_config["server"]["debug"] = False
            base_config["server"]["reload"] = False
            base_config["server"]["workers"] = 4
            base_config["monitoring"]["log_level"] = "WARNING"
            base_config["security"]["rate_limit"]["requests_per_minute"] = 60
            base_config["ai"]["max_concurrent_requests"] = 8
        
        return base_config

    def _save_environment_config(self, env: Union[Environment, str]):
        """Save environment configuration to file."""
        name = _environment_name(env)
        config_file = self.environments_root / f"{name}.json"
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config_cache[name], f, indent=2, ensure_ascii=False)
            logger.info("Saved %s configuration", name)
        except Exception:
            logger.exception("Failed to save %s config", name)
            raise

    def set_environment(self, env: Union[Environment, str]):
        """Set current environment."""
        name = _environment_name(env)
        if name in self.config_cache:
            self.current_environment = name
            logger.info("Switched to %s environment", name)
            return True
        else:
            logger.error("Environment %s not found", name)
            return False

    def get_current_environment(self) -> str:
        """Get current environment."""
        return self.current_environment

    def get_config(
        self,
        env: Optional[Union[Environment, str]] = None,
        path: Optional[str] = None,
    ) -> Any:
        """Get configuration value for environment."""
        if env is None:
            env = self.current_environment
        name = _environment_name(env)

        if name not in self.config_cache:
            return None

        config = self.config_cache[name]
        
        if path is None:
            return config
        
        # Navigate nested path (e.g., "server.port")
        keys = path.split('.')
        for key in keys:
            if isinstance(config, dict) and key in config:
                config = config[key]
            else:
                return None
        
        return config

    def set_config(self, env: Union[Environment, str], path: str, value: Any):
        """Set configuration value for environment."""
        name = _environment_name(env)
        if name not in self.config_cache:
            raise ValueError(f"Environment {name} not found")

        previous_config = copy.deepcopy(self.config_cache[name])
        config = self.config_cache[name]
        keys = path.split('.')
        for key in keys[:-1]:
            if key not in config:
                config[key] = {}
            config = config[key]

        config[keys[-1]] = value
        try:
            self._save_environment_config(name)
        except Exception:
            self.config_cache[name] = previous_config
            raise

    def get_database_url(self, env: Optional[Union[Environment, str]] = None) -> str:
        """Get database URL for environment."""
        return self.get_config(env or self.current_environment, "database.url")

    def get_server_config(self, env: Optional[Union[Environment, str]] = None) -> Dict[str, Any]:
        """Get server configuration for environment."""
        return self.get_config(env or self.current_environment, "server")

    def get_ai_config(self, env: Optional[Union[Environment, str]] = None) -> Dict[str, Any]:
        """Get AI configuration for environment."""
        return self.get_config(env or self.current_environment, "ai")

    def get_monitoring_config(self, env: Optional[Union[Environment, str]] = None) -> Dict[str, Any]:
        """Get monitoring configuration for environment."""
        return self.get_config(env or self.current_environment, "monitoring")

    def get_security_config(self, env: Optional[Union[Environment, str]] = None) -> Dict[str, Any]:
        """Get security configuration for environment."""
        return self.get_config(env or self.current_environment, "security")

    def get_storage_config(self, env: Optional[Union[Environment, str]] = None) -> Dict[str, Any]:
        """Get storage configuration for environment."""
        return self.get_config(env or self.current_environment, "storage")

    def validate_environment(self, env: Union[Environment, str]) -> Dict[str, Any]:
        """Validate the stored configuration for an environment."""
        name = _environment_name(env)
        return self.validate_configuration(self.config_cache.get(name, {}), name)

    def validate_configuration(self, config: Any, env: Union[Environment, str]) -> Dict[str, Any]:
        """Validate a configuration value without changing stored environment state."""
        name = _environment_name(env)
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "environment": name
        }

        if not isinstance(config, dict):
            validation_result["valid"] = False
            validation_result["errors"].append("Configuration must be a dictionary")
            return validation_result
        
        # Validate server config
        server_config = config.get("server", {})
        if not isinstance(server_config.get("port"), int):
            validation_result["valid"] = False
            validation_result["errors"].append("Server port must be an integer")
        
        # Validate AI config
        ai_config = config.get("ai", {})
        if ai_config.get("max_concurrent_requests", 0) < 1:
            validation_result["warnings"].append("AI max_concurrent_requests should be at least 1")
        
        # Validate storage config
        storage_config = config.get("storage", {})
        if storage_config.get("max_file_size", 0) < 1024 * 1024:  # 1MB minimum
            validation_result["warnings"].append("Storage max_file_size should be at least 1MB")
        
        return validation_result

    def list_environments(self) -> List[str]:
        """List all available environments."""
        built_in_names = [env.value for env in Environment]
        custom_names = sorted(name for name in self.config_cache if name not in built_in_names)
        return built_in_names + custom_names

    def resolve_environment(self, env: Union[Environment, str]) -> str:
        """Return a normalized environment name or raise when it is unavailable."""
        name = _environment_name(env)
        if name not in self.config_cache:
            raise ValueError(f"Environment {name} not found")
        return name

    def create_custom_environment(
        self,
        name: str,
        base_env: Union[Environment, str] = Environment.DEVELOPMENT,
    ):
        """Create a custom environment based on an existing one."""
        try:
            custom_name = _environment_name(name)
            base_name = _environment_name(base_env)
            if custom_name in {env.value for env in Environment}:
                return {"success": False, "error": "Cannot create an environment with a built-in name"}
            if custom_name in self.config_cache:
                return {"success": False, "error": f"Environment {name} already exists"}
            if base_name not in self.config_cache:
                return {"success": False, "error": f"Base environment {base_name} not found"}

            self.config_cache[custom_name] = copy.deepcopy(self.config_cache[base_name])
            try:
                self._save_environment_config(custom_name)
            except Exception:
                del self.config_cache[custom_name]
                raise

            return {
                "success": True,
                "environment": custom_name,
                "base_environment": base_name
            }

        except ValueError as error:
            return {
                "success": False,
                "error": str(error)
            }

    def delete_custom_environment(self, name: str):
        """Delete a custom environment."""
        try:
            custom_name = _environment_name(name)
            if custom_name in {env.value for env in Environment}:
                return {"success": False, "error": "Cannot delete built-in environment"}
            if custom_name == self.current_environment:
                return {"success": False, "error": "Cannot delete the active environment"}
            if custom_name not in self.config_cache:
                return {"success": False, "error": f"Environment {name} not found"}

            config_file = self.environments_root / f"{custom_name}.json"
            if config_file.exists():
                config_file.unlink()
            del self.config_cache[custom_name]
            return {"success": True, "message": f"Environment {custom_name} deleted"}

        except ValueError as error:
            return {
                "success": False,
                "error": str(error)
            }

    def export_configuration(self, env: Union[Environment, str]) -> Dict[str, Any]:
        """Export environment configuration as JSON."""
        name = _environment_name(env)
        if name not in self.config_cache:
            return {"success": False, "error": f"Environment {name} not found"}

        return {
            "success": True,
            "environment": name,
            "config": self.config_cache[name],
            "exported_at": datetime.now().isoformat()
        }

    def import_configuration(self, env: Union[Environment, str], config_data: Any) -> Dict[str, Any]:
        """Import environment configuration from JSON."""
        try:
            name = _environment_name(env)
            # Validate configuration
            if not isinstance(config_data, dict):
                return {"success": False, "error": "Configuration must be a dictionary"}
            
            # Validate configuration structure
            validation = self.validate_configuration(config_data, name)
            if not validation["valid"]:
                return {"success": False, "error": f"Configuration validation failed: {validation['errors']}"}
            
            # Import configuration
            previous_config = self.config_cache[name]
            self.config_cache[name] = copy.deepcopy(config_data)
            try:
                self._save_environment_config(name)
            except Exception:
                self.config_cache[name] = previous_config
                raise
            
            return {
                "success": True,
                "environment": name,
                "imported_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {"success": False, "error": f"Failed to import configuration: {str(e)}"}

# Global configuration manager instance
config_manager = ConfigManager()

# Utility functions for easy access
def set_environment(env: str):
    """Set current environment by name."""
    try:
        return config_manager.set_environment(env)
    except ValueError:
        return False

def get_current_environment() -> str:
    """Get current environment name."""
    return config_manager.get_current_environment()

def get_config(path: str, env: Optional[str] = None) -> Any:
    """Get configuration value by path and optional environment."""
    return config_manager.get_config(env, path)