import logging

from fastapi import APIRouter, HTTPException
from models.request_schemas import GenerateImageRequest, InpaintImageRequest
from models.response_schemas import ImageResponse
from art_service import ImageInpaintingUnavailableError, art_service

router = APIRouter(prefix="/art", tags=["art"])
logger = logging.getLogger("studio.backend.routes.art")

@router.post("/generate", response_model=ImageResponse)
async def generate_image(request: GenerateImageRequest):
    try:
        generation_config = dict(request.config)
        if "palette" in generation_config:
            raise HTTPException(
                status_code=422,
                detail="Provide palette settings in the palette field, not config",
            )
        if request.palette.mode != "off":
            generation_config["palette"] = request.palette.model_dump()
        result = await art_service.generate(
            prompt=request.prompt,
            seed=request.seed,
            gen_config=generation_config,
        )
        if not isinstance(result, dict) or not result.get("image_base64"):
            logger.error("Image generation returned no image")
            raise HTTPException(
                status_code=502,
                detail="Image generation did not return an image",
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/inpaint", response_model=ImageResponse)
async def inpaint_image(request: InpaintImageRequest):
    try:
        result = await art_service.inpaint(
            base_image_b64=request.base_image,
            mask_image_b64=request.mask_image,
            prompt=request.prompt,
            seed=request.seed,
            gen_config=request.config
        )
        return result
    except ImageInpaintingUnavailableError as error:
        raise HTTPException(status_code=501, detail=str(error)) from error
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/feedback")
async def submit_art_feedback(seed: int, feedback_type: str, score: int):
    try:
        result = await art_service.submit_feedback(seed, feedback_type, score)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
