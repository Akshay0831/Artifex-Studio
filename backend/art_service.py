import asyncio
import base64
import logging
import time
import torch
from typing import Dict, Optional, Any, Callable, List, cast

from config.config import Settings
settings = Settings()
from inference_dispatcher import dispatcher
from utils.telemetry import trace_performance
from utils.cache import generation_cache
from utils.encoding import pil_to_base64
from models.request_schemas import ImagePaletteSettings
from services.palette_service import palette_service

# Use our real AI implementations instead of mocks
from ai_models.model_manager import ModelManager
from ai_models.device_utils import get_device
from ai_models.model_types import ModelType, QuantizationType

# Mock feedback integration for now (we'll implement this properly later)
class FeedbackIntegration:
    def __init__(self):
        pass
    def RecordScore(self, *args): pass
    def GetAverageScore(self, *args): return 0.0

from utils.batch_processor import batch_processor
from utils.timeout import async_with_timeout
from utils.base_service import BaseStudioService

logger = logging.getLogger("studio.backend.art_service")

class ImageInpaintingUnavailableError(NotImplementedError):
    """Raised because no configured image inpainting backend is implemented."""


class ArtService(BaseStudioService):
    def __init__(self):
        super().__init__("art")
        self.model_manager = ModelManager()  # Use separate instance for better memory control
        self.feedback_system = FeedbackIntegration()
        self.device = get_device()
        
        # Register batch handlers
        batch_processor.register_handler("generate_image", self._handle_batch_generate)

    async def _handle_batch_generate(self, tasks: List[Any]) -> List[Any]:
        """Internal handler for BatchProcessor."""
        if not tasks:
            return []
            
        # Coalesce tasks
        prompt = tasks[0].params["prompt"] # Simplified: assume same prompt for now
        seeds = [t.params["seed"] for t in tasks]
        gen_config = tasks[0].params.get("gen_config", {})
        
        async def unified_stream_callback(progress_data):
            # Broadcast progress to all tasks in the batch
            import asyncio
            await asyncio.gather(*[
                t.callback(progress_data) for t in tasks if t.callback
            ])
        
        model_name = gen_config.get("model", "sdxl").upper()
        model_type = getattr(ModelType, model_name, ModelType.SDXL)
        
        return await self._generate_batch_local(prompt, seeds, gen_config, model_type, unified_stream_callback)

    @trace_performance("generate_image")
    async def generate(
        self,
        prompt: str,
        seed: int,
        gen_config: Dict[str, Any],
        stream_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """Generates an image using the diffusion pipeline."""
        palette_settings = ImagePaletteSettings.model_validate(
            gen_config.get("palette", {})
        )
        if "palette" in gen_config:
            gen_config = {**gen_config, "palette": palette_settings.model_dump()}

        cached_result = generation_cache.get(prompt, seed, gen_config)
        if cached_result:
            if stream_callback:
                await stream_callback({"progress": 100, "status": "completed"})
            return cached_result

        logger.info(f"Generating image | Prompt: {prompt[:50]}... | Seed: {seed}")
        
        # API key selection and routing
        from config.api_key_manager import api_key_manager
        current_profile = api_key_manager.get_current_profile()
        
        if not current_profile:
            return {"error": "No active API profile selected"}
        
        routing = await self.route_and_execute("generate_image", {"prompt": prompt, "seed": seed})
        
        if routing["backend"] == "local_gpu":
            model_name = gen_config.get("model", "sdxl").upper()
            model_type = getattr(ModelType, model_name, ModelType.SDXL)
            
            # Using the unified run_with_progress
            # Note: _generate_local handles its own internal progress via callback_on_step_end
            # but we can wrap it if we want simulated progress for non-callback pipelines
            result = await self._generate_local(prompt, seed, gen_config, model_type, stream_callback)
            
            result = self._apply_palette(result, palette_settings)
            if result and "error" not in result:
                generation_cache.set(prompt, seed, gen_config, result)
            return result
        elif routing["backend"] == "api":
            # Use API key for external AI service
            api_config = {
                "prompt": prompt,
                "seed": seed,
                "gen_config": gen_config,
                "api_key": current_profile.api_key,
                "api_type": current_profile.api_type,
                "model": gen_config.get("model", current_profile.default_model)
            }
            result = await self._generate_api(api_config, stream_callback)
            result = self._apply_palette(result, palette_settings)
            if result and "error" not in result:
                generation_cache.set(prompt, seed, gen_config, result)
            return result
        else:
            return {"error": "Non-local GPU generation not yet optimized in service layer", "routing": routing}

    @staticmethod
    def _apply_palette(
        result: Dict[str, Any],
        palette_settings: ImagePaletteSettings,
    ) -> Dict[str, Any]:
        if not result or "error" in result or palette_settings.mode == "off":
            return result
        image_base64 = result.get("image_base64")
        if not image_base64:
            raise ValueError("Image generation returned no image to apply the palette to")
        processed_image, palette_metadata = palette_service.apply(
            image_base64, palette_settings
        )
        return {
            **result,
            "image_base64": processed_image,
            "palette": palette_metadata,
        }

    @trace_performance("inpaint_image")
    async def inpaint(
        self,
        base_image_b64: str,
        mask_image_b64: str,
        prompt: str,
        seed: int,
        gen_config: Dict[str, Any],
        stream_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """Report that image inpainting is unavailable instead of returning a fake result."""
        logger.info(
            "Rejected unavailable inpainting request "
            "(base_chars=%s, mask_chars=%s, prompt_chars=%s, seed=%s, config_keys=%s, stream=%s)",
            len(base_image_b64),
            len(mask_image_b64),
            len(prompt),
            seed,
            len(gen_config),
            stream_callback is not None,
        )
        raise ImageInpaintingUnavailableError(
            "Image inpainting is not implemented for the configured backends."
        )

    async def generate_batch(
        self,
        prompt: str,
        seeds: List[int],
        gen_config: Dict[str, Any],
        stream_callback: Optional[Callable] = None
    ) -> List[Dict[str, Any]]:
        """Generates a batch of images for the same prompt with different seeds."""
        palette_settings = ImagePaletteSettings.model_validate(
            gen_config.get("palette", {})
        )
        if "palette" in gen_config:
            gen_config = {**gen_config, "palette": palette_settings.model_dump()}

        results: List[Optional[Dict[str, Any]]] = [None] * len(seeds)
        seeds_to_generate = []
        generation_indices = []
        
        for index, seed in enumerate(seeds):
            cached = generation_cache.get(prompt, seed, gen_config)
            if cached:
                results[index] = cached
            else:
                seeds_to_generate.append(seed)
                generation_indices.append(index)
        
        if not seeds_to_generate:
            if stream_callback:
                steps = gen_config.get("steps", 30)
                await stream_callback({"step": steps, "total_steps": steps, "progress": 100})
            return [result for result in results if result is not None]

        logger.info(f"Generating batch of {len(seeds_to_generate)} images | Prompt: {prompt[:50]}...")
        
        model_name = gen_config.get("model", "sdxl").upper()
        model_type = getattr(ModelType, model_name, ModelType.SDXL)

        routing = await dispatcher.route_inference("generate_image", {"prompt": prompt, "seeds": seeds_to_generate})
        
        if routing["backend"] == "local_gpu":
            batch_results = await self._generate_batch_local(prompt, seeds_to_generate, gen_config, model_type, stream_callback)
        else:
            batch_results = []
            for seed in seeds_to_generate:
                batch_results.append(await self._generate_cpu(prompt, seed, gen_config))

        if len(batch_results) != len(seeds_to_generate):
            raise RuntimeError("Image batch returned an unexpected number of results")

        for index, seed, result in zip(generation_indices, seeds_to_generate, batch_results):
            result = self._apply_palette(result, palette_settings)
            generation_cache.set(prompt, seed, gen_config, result)
            results[index] = result

        return [result for result in results if result is not None]

    @trace_performance("local_gpu_batch_generation")
    async def _generate_batch_local(
        self,
        prompt: str,
        seeds: List[int],
        gen_config: Dict[str, Any],
        model_type: ModelType,
        stream_callback: Optional[Callable] = None
    ) -> List[Dict[str, Any]]:
        """Local GPU batch generation."""
        diffusion_pipeline = cast(
            Callable[..., Any],
            self.model_manager.GetPipeline(
                model_type,
                pipeline_type="txt2img",
                quantization=QuantizationType.NONE
            ),
        )
        
        inference_steps = gen_config.get("steps", 30)
        num_images = len(seeds)
        
        # Apply model-specific tools
        if model_type == ModelType.FLUX:
            if gen_config.get("ultra_detail"):
                logger.info("Flux Extension | Ultra Detail enabled")
                inference_steps = int(inference_steps * 1.5)
        elif model_type == ModelType.SDXL:
            if gen_config.get("fast_mode"):
                logger.info("SDXL Extension | Fast Mode enabled")
                inference_steps = max(10, int(inference_steps * 0.5))

        def callback_on_step_end(pipe, i, t, callback_kwargs):
            if stream_callback:
                import asyncio
                progress = int((i + 1) / inference_steps * 100)
                asyncio.run_coroutine_threadsafe(
                    stream_callback({"step": i, "total_steps": inference_steps, "progress": progress}),
                    asyncio.get_event_loop()
                )
            return callback_kwargs

        def run_inference():
            with torch.inference_mode():
                generators = [torch.Generator(device=self.device).manual_seed(s) for s in seeds]
                return diffusion_pipeline(
                    prompt=[prompt] * num_images,
                    num_inference_steps=inference_steps,
                    generator=generators,
                    callback_on_step_end=callback_on_step_end if stream_callback else None
                )

        generation_output = await async_with_timeout(
            asyncio.to_thread(run_inference),
            timeout_seconds=settings.BATCH_INFERENCE_TIMEOUT,
            timeout_error=f"Batch generation timeout after {settings.BATCH_INFERENCE_TIMEOUT} seconds"
        )

        results = []
        for i, image in enumerate(generation_output.images):
            results.append({
                "image_base64": pil_to_base64(image),
                "seed": seeds[i],
                "backend": "local_gpu"
            })
        return results

    @trace_performance("local_gpu_generation")
    async def _generate_local(
        self, 
        prompt: str, 
        seed: int, 
        gen_config: Dict[str, Any],
        model_type: ModelType,
        stream_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """Local GPU generation."""
        diffusion_pipeline = cast(
            Callable[..., Any],
            self.model_manager.GetPipeline(
                model_type,
                pipeline_type="txt2img",
                quantization=QuantizationType.NONE
            ),
        )
        
        generator = torch.Generator(device=self.device).manual_seed(seed)
        inference_steps = gen_config.get("steps", 30)

        def callback_on_step_end(pipe, i, t, callback_kwargs):
            if stream_callback:
                import asyncio
                progress = int((i + 1) / inference_steps * 100)
                asyncio.run_coroutine_threadsafe(
                    stream_callback({"step": i, "total_steps": inference_steps, "progress": progress}),
                    asyncio.get_event_loop()
                )
            return callback_kwargs

        def run_inference():
            with torch.inference_mode():
                return diffusion_pipeline(
                    prompt=prompt,
                    num_inference_steps=inference_steps,
                    generator=generator,
                    callback_on_step_end=callback_on_step_end if stream_callback else None
                )

        generation_output = await async_with_timeout(
            asyncio.to_thread(run_inference),
            timeout_seconds=settings.INFERENCE_TIMEOUT,
            timeout_error=f"Image generation timeout after {settings.INFERENCE_TIMEOUT} seconds"
        )

        final_image = generation_output.images[0]
        return {
            "image_base64": pil_to_base64(final_image),
            "seed": seed,
            "backend": "local_gpu"
        }

    async def _generate_cpu(self, prompt: str, seed: int, gen_config: Dict[str, Any]) -> Dict[str, Any]:
        """CPU generation logic."""
        return {"error": "CPU fallback not yet optimized", "backend": "cpu"}

    async def _generate_api(self, config: Dict[str, Any], stream_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """API-based image generation using external AI services."""
        api_type = config.get("api_type")
        api_key = config.get("api_key")
        prompt = config.get("prompt")
        seed = config.get("seed")
        gen_config = config.get("gen_config", {})
        model = config.get("model")
        
        if not isinstance(api_key, str) or not api_key.strip():
            return {"error": "The selected API profile does not have an API key configured"}
        if not isinstance(prompt, str) or not prompt.strip():
            return {"error": "A non-empty prompt is required for API image generation"}
        if isinstance(seed, bool) or not isinstance(seed, int):
            return {"error": "An integer seed is required for API image generation"}
        if not isinstance(gen_config, dict):
            return {"error": "Image generation settings must be an object"}
        if not isinstance(model, str) or not model.strip():
            return {"error": "A model must be selected for API image generation"}

        logger.info(f"API generation | Type: {api_type} | Model: {model} | Prompt: {prompt[:50]}...")
        
        try:
            if api_type == "replicate":
                result = await self._generate_replicate(
                    prompt,
                    seed,
                    gen_config,
                    model,
                    stream_callback,
                    api_key=api_key,
                )
            elif api_type == "runpod":
                result = await self._generate_runpod(
                    prompt,
                    seed,
                    gen_config,
                    model,
                    stream_callback,
                    api_key=api_key,
                )
            elif api_type == "openai":
                result = await self._generate_openai(
                    prompt,
                    seed,
                    gen_config,
                    model,
                    stream_callback,
                    api_key=api_key,
                )
            else:
                return {"error": f"Unsupported API type: {api_type}"}
            
            return result
            
        except Exception as e:
            logger.error(f"API generation failed: {str(e)}")
            return {"error": f"API generation failed: {str(e)}"}

    async def _generate_replicate(
        self,
        prompt: str,
        seed: int,
        gen_config: Dict[str, Any],
        model: str,
        stream_callback: Optional[Callable] = None,
        *,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Replicate API-based image generation."""
        import requests
        
        try:
            if not api_key:
                return {"error": "Replicate API key is required"}
            headers = {
                "Authorization": f"Token {api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "input": {
                    "prompt": gen_config.get("default_prompt", "") + prompt,
                    "negative_prompt": gen_config.get("negative_prompt", ""),
                    "num_inference_steps": gen_config.get("steps", 30),
                    "guidance_scale": gen_config.get("cfg", 7.5),
                    "width": int(gen_config.get("size", "1024x1024").split("x")[0]),
                    "height": int(gen_config.get("size", "1024x1024").split("x")[1])
                },
                "version": f"{model}-latest"
            }
            
            response = await asyncio.to_thread(
                requests.post,
                "https://api.replicate.com/v1/predictions",
                headers=headers,
                json=data,
                timeout=300,
            )
            
            if response.status_code != 201:
                return {"error": f"Replicate API error: {response.status_code} - {response.text}"}
            
            prediction = response.json()
            prediction_url = prediction.get("urls", {}).get("get", "")
            
            # Poll for completion without blocking the ASGI event loop.
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                status_response = await asyncio.to_thread(
                    requests.get, prediction_url, headers=headers, timeout=30
                )
                status_response.raise_for_status()
                status = status_response.json()
                
                if status.get("status") == "succeeded":
                    # Extract image URL
                    output_url = status.get("output", [])
                    if isinstance(output_url, list) and output_url:
                        output_url = output_url[0]
                    if isinstance(output_url, str) and output_url:
                        image_response = await asyncio.to_thread(
                            requests.get, output_url, timeout=300
                        )
                        image_response.raise_for_status()
                        return {
                            "image_base64": base64.b64encode(image_response.content).decode("ascii"),
                            "seed": seed,
                            "backend": "api"
                        }
                
                elif status.get("status") == "failed":
                    return {"error": f"Replicate generation failed: {status.get('error', 'Unknown error')}"}
                
                # Progress reporting
                progress = status.get("logs", [""])
                if progress and stream_callback:
                    await stream_callback({"progress": 50, "status": "processing", "message": progress[-1]})
                
                await asyncio.sleep(2)

            return {"error": "Replicate generation timed out while waiting for a prediction"}
                
        except Exception as e:
            logger.error(f"Replicate API generation failed: {str(e)}")
            return {"error": f"Replicate API generation failed: {str(e)}"}

    async def _generate_runpod(
        self,
        prompt: str,
        seed: int,
        gen_config: Dict[str, Any],
        model: str,
        stream_callback: Optional[Callable] = None,
        *,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """RunPod API-based image generation."""
        import requests
        
        try:
            if not api_key:
                return {"error": "RunPod API key is required"}
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "input": {
                    "prompt": prompt,
                    "negative_prompt": gen_config.get("negative_prompt", ""),
                    "steps": gen_config.get("steps", 30),
                    "guidance_scale": gen_config.get("cfg", 7.5),
                    "width": int(gen_config.get("size", "1024x1024").split("x")[0]),
                    "height": int(gen_config.get("size", "1024x1024").split("x")[1]),
                    "seed": seed
                },
                "model": model
            }
            
            response = await asyncio.to_thread(
                requests.post,
                "https://api.runpod.ai/v2/runpod-worker-stream/predict",
                headers=headers,
                json=data,
                timeout=300,
            )
            
            if response.status_code != 200:
                return {"error": f"RunPod API error: {response.status_code} - {response.text}"}
            
            result = response.json()
            output_url = result.get("output", {}).get("url")
            
            if output_url:
                image_response = await asyncio.to_thread(
                    requests.get, output_url, timeout=300
                )
                image_response.raise_for_status()
                return {
                    "image_base64": base64.b64encode(image_response.content).decode("ascii"),
                    "seed": seed,
                    "backend": "api"
                }
            
            return {"error": "RunPod generation failed: No output URL returned"}
            
        except Exception as e:
            logger.error(f"RunPod API generation failed: {str(e)}")
            return {"error": f"RunPod API generation failed: {str(e)}"}

    async def _generate_openai(
        self,
        prompt: str,
        seed: int,
        gen_config: Dict[str, Any],
        model: str,
        stream_callback: Optional[Callable] = None,
        *,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """OpenAI API-based image generation."""
        import requests
        
        try:
            if not api_key:
                return {"error": "OpenAI API key is required"}
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "prompt": prompt,
                "n": 1,
                "size": gen_config.get("size", "1024x1024"),
                "quality": gen_config.get("quality", "standard"),
                "seed": seed
            }
            
            response = await asyncio.to_thread(
                requests.post,
                "https://api.openai.com/v1/images/generations",
                headers=headers,
                json=data,
                timeout=300,
            )
            
            if response.status_code != 200:
                return {"error": f"OpenAI API error: {response.status_code} - {response.text}"}
            
            result = response.json()
            image_results = result.get("data", [])
            if not image_results:
                return {"error": "OpenAI generation failed: No image returned"}
            image_data = image_results[0]
            image_base64 = image_data.get("b64_json")
            if image_base64:
                return {
                    "image_base64": image_base64,
                    "seed": seed,
                    "backend": "api"
                }
            image_url = image_data.get("url")
            
            if image_url:
                image_response = await asyncio.to_thread(
                    requests.get, image_url, timeout=300
                )
                image_response.raise_for_status()
                return {
                    "image_base64": base64.b64encode(image_response.content).decode("ascii"),
                    "seed": seed,
                    "backend": "api"
                }
            
            return {"error": "OpenAI generation failed: No image URL returned"}
            
        except Exception as e:
            logger.error(f"OpenAI API generation failed: {str(e)}")
            return {"error": f"OpenAI API generation failed: {str(e)}"}

    async def submit_feedback(self, seed: int, feedback_type: str, score: int) -> Dict[str, Any]:
        """Record human feedback for quality tracking."""
        self.feedback_system.RecordScore(feedback_type, score)
        avg = self.feedback_system.GetAverageScore(feedback_type)
        return {"status": "recorded", "average": avg}

art_service = ArtService()
