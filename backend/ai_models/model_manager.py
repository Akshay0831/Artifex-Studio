"""
Model Manager for AI Image Generation
Real working implementation using diffusers and transformers
"""

import torch
import logging
from typing import Optional, Dict, Any, List, Union
from diffusers.pipelines.pipeline_utils import DiffusionPipeline
from diffusers.pipelines.flux.pipeline_flux import FluxPipeline
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion import (
    StableDiffusionPipeline,
)
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl import (
    StableDiffusionXLPipeline,
)

from .device_utils import DeviceUtils
from .model_types import ModelType, QuantizationType, get_model_type

logger = logging.getLogger(__name__)

# Global instances
_device_utils: Optional[DeviceUtils] = None
_model_manager: Optional["ModelManager"] = None

def get_device_utils() -> DeviceUtils:
    """Get global device utils instance"""
    global _device_utils
    if _device_utils is None:
        _device_utils = DeviceUtils()
    return _device_utils

def get_model_manager() -> "ModelManager":
    """Get global model manager instance to avoid multiple loads"""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager

class ModelManager:
    """
    Real working ModelManager that loads and manages AI image generation models
    """
    
    def __init__(self):
        self.device_utils = get_device_utils()
        self.device = self.device_utils.device
        self.device_type = self.device_utils.device_type
        
        # Model cache
        self._pipelines: Dict[str, DiffusionPipeline] = {}
        self._model_configs = self._get_model_configs()
        
        logger.info(f"ModelManager initialized on device: {self.device}")
    
    def _get_model_configs(self) -> Dict[str, Dict[str, Any]]:
        """Get configuration for each model type"""
        return {
            ModelType.SDXL.value: {
                "class": StableDiffusionXLPipeline,
                "default_steps": 30,
                "default guidance": 7.5,
            },
            ModelType.SD15.value: {
                "class": StableDiffusionPipeline,
                "default_steps": 30,
                "default guidance": 7.5,
            },
            ModelType.FLUX.value: {
                "class": FluxPipeline,
                "default_steps": 50,
                "default guidance": 7.0,
            },
            ModelType.STABLE_DIFFUSION.value: {
                "class": StableDiffusionPipeline,
                "default_steps": 30,
                "default guidance": 7.5,
            },
        }
    
    def GetPipeline(
        self, 
        model_type: Union[ModelType, str], 
        pipeline_type: str = "txt2img",
        quantization: Union[QuantizationType, str] = QuantizationType.NONE
    ) -> DiffusionPipeline:
        """
        Get or create a diffusion pipeline
        
        Args:
            model_type: Model type (SDXL, SD15, FLUX)
            pipeline_type: txt2img or inpaint
            quantization: Quantization level
            
        Returns:
            DiffusionPipeline instance
        """
        # Convert string to enum if needed
        if isinstance(model_type, str):
            model_type = get_model_type(model_type)
        
        if isinstance(quantization, str):
            quantization = QuantizationType(quantization)
        
        if pipeline_type != "txt2img":
            raise NotImplementedError(
                f"Pipeline type {pipeline_type!r} is not implemented."
            )
        if quantization is not QuantizationType.NONE:
            raise NotImplementedError(
                f"Quantization type {quantization.value!r} is not implemented."
            )

        # Create cache key
        cache_key = model_type.value
        
        # Check if we have a cached pipeline and enough memory
        if cache_key in self._pipelines:
            # Check if we have enough free memory
            if torch.cuda.is_available():
                memory_info = torch.cuda.memory_allocated() / 1024**3  # Convert to GB
                total_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
                free_memory = total_memory - memory_info
                
                # If less than 2GB free, clear cache
                if free_memory < 2.0:
                    logger.info("Low memory detected, clearing pipeline cache")
                    self.clear_cache()
                    # Load fresh pipeline
                    return self._load_pipeline(model_type)
                else:
                    logger.debug(f"Using cached pipeline: {cache_key}")
                    return self._pipelines[cache_key]
            else:
                logger.debug(f"Using cached pipeline: {cache_key}")
                return self._pipelines[cache_key]
        
        # Load new pipeline
        logger.info(f"Loading pipeline: {cache_key}")
        pipeline = self._load_pipeline(model_type)
        
        # Cache the pipeline but limit to 1 pipeline to save memory
        if len(self._pipelines) >= 1:
            # Remove the oldest pipeline
            oldest_key = list(self._pipelines.keys())[0]
            logger.info(f"Removing oldest pipeline: {oldest_key} to free memory")
            del self._pipelines[oldest_key]
        
        self._pipelines[cache_key] = pipeline
        logger.info(f"Pipeline loaded and cached: {cache_key}")
        
        return pipeline
    
    def _load_pipeline(
        self,
        model_type: ModelType,
    ) -> DiffusionPipeline:
        """Load a specific pipeline"""
        config = self._model_configs.get(model_type.value)
        if not config:
            raise ValueError(f"Unsupported model type: {model_type}")
        
        # Determine model ID (using community models for better performance)
        model_id = self._get_model_id(model_type)
        
        # Load pipeline with proper configuration
        try:
            # Aggressively clear GPU memory before loading new pipeline
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()
                # Force garbage collection to free memory
                import gc
                gc.collect()
                # Clear more aggressively
                torch.cuda.empty_cache()
                gc.collect()
            
            pipeline_class = config["class"]
            pipeline = pipeline_class.from_pretrained(
                model_id,
                torch_dtype=torch.float16 if self.device_type == "cuda" else torch.float32,
            )
            # Enable model CPU offload for memory optimization
            # This automatically manages device placement for all components
            # including tokenizers, so we don't need to manually move the pipeline
            if hasattr(pipeline, "enable_model_cpu_offload"):
                pipeline.enable_model_cpu_offload()
                logger.info(f"Model CPU offload enabled for {model_type.value} pipeline")
            else:
                # Fallback: move pipeline to device
                pipeline = pipeline.to(self.device)
                logger.info(f"Pipeline loaded and moved to {self.device}")
            
            logger.info(f"Successfully loaded {model_type.value} pipeline from {model_id}")
            return pipeline
            
        except Exception as e:
            logger.error(f"Failed to load pipeline: {e}")
            # Clean up memory before raising exception
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise
    
    def _get_model_id(self, model_type: ModelType) -> str:
        """Get the model ID for the specified model type"""
        # Use smaller models for better memory efficiency
        model_map = {
            ModelType.SDXL: "stabilityai/stable-diffusion-xl-base-1.0",
            ModelType.SD15: "runwayml/stable-diffusion-v1-5",
            ModelType.FLUX: "black-forest-labs/FLUX.1-schnell",
            ModelType.STABLE_DIFFUSION: "runwayml/stable-diffusion-v1-5",
        }
        try:
            return model_map[model_type]
        except KeyError as error:
            raise ValueError(f"Unsupported model type: {model_type}") from error
    
    def get_cached_pipelines(self) -> List[str]:
        """Get list of cached pipeline keys"""
        return list(self._pipelines.keys())
    
    def clear_cache(self):
        """Clear all cached pipelines"""
        for key, pipeline in self._pipelines.items():
            try:
                # Move to CPU to free GPU memory
                pipeline.to("cpu")
            except Exception as e:
                logger.warning(f"Failed to move pipeline {key} to CPU: {e}")
        
        self._pipelines.clear()
        logger.info("Pipeline cache cleared")
    
    def get_memory_usage(self) -> Dict[str, Any]:
        """Get memory usage information"""
        memory_info = self.device_utils.get_memory_info()
        
        # Add pipeline cache info
        cache_size = len(self._pipelines)
        cache_memory_bytes = 0
        for pipeline in self._pipelines.values():
            for component in pipeline.components.values():
                if isinstance(component, torch.nn.Module):
                    cache_memory_bytes += sum(
                        parameter.numel() * parameter.element_size()
                        for parameter in component.parameters()
                    )
        
        return {
            **memory_info,
            "cached_pipelines": cache_size,
            "estimated_cache_gb": round(cache_memory_bytes / 1024**3, 2)
        }
    
    def __del__(self):
        """Cleanup when destroyed"""
        if hasattr(self, "_pipelines"):
            self.clear_cache()
