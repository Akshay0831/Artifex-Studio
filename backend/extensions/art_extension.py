import logging
from typing import Dict, Any
from fastapi import WebSocket
from art_service import art_service

logger = logging.getLogger("studio.backend.extensions.art")

def _required_string(payload: Dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


async def handle_generate_image(websocket: WebSocket, message_payload: Dict[str, Any]):
    prompt = _required_string(message_payload, "prompt")
    variation_count = message_payload.get("num_variations", 1)
    base_seed = message_payload.get("seed", 42)
    gen_config = message_payload.get("config", {})
    target_worktree = message_payload.get("worktree", "main")
    seeds = [base_seed + i for i in range(variation_count)]
    
    async def stream_callback(progress_data):
        await websocket.send_json({
            "type": "image_chunk",
            "worktree": target_worktree,
            "metadata": progress_data
        })
    
    if variation_count > 1:
        logger.info(f"Art Extension | Batch generation | Variations: {variation_count} | Worktree: {target_worktree}")
        batch_results = await art_service.generate_batch(prompt, seeds, gen_config, stream_callback)
        for i, result in enumerate(batch_results):
            await websocket.send_json({
                "type": "generation_complete",
                "worktree": target_worktree,
                "variation_index": i,
                "result": result
            })
    else:
        logger.info(f"Art Extension | Single generation | Worktree: {target_worktree}")
        result = await art_service.generate(prompt, base_seed, gen_config, stream_callback)
        await websocket.send_json({
            "type": "generation_complete",
            "worktree": target_worktree,
            "variation_index": 0,
            "result": result
        })

async def handle_inpaint_image(websocket: WebSocket, message_payload: Dict[str, Any]):
    prompt = _required_string(message_payload, "prompt")
    seed = message_payload.get("seed", 42)
    base_image = _required_string(message_payload, "base_image")
    mask_image = _required_string(message_payload, "mask_image")
    gen_config = message_payload.get("config", {})
    target_worktree = message_payload.get("worktree", "main")
    
    async def stream_callback(progress_data):
        await websocket.send_json({
            "type": "image_chunk",
            "worktree": target_worktree,
            "metadata": progress_data
        })
        
    logger.info(f"Art Extension | Inpainting | Worktree: {target_worktree}")
    result = await art_service.inpaint(
        base_image, mask_image, prompt, seed, gen_config, stream_callback
    )
    await websocket.send_json({
        "type": "generation_complete",
        "worktree": target_worktree,
        "variation_index": 0,
        "result": result
    })

def register(manager):
    manager.register_handler("generate_image", handle_generate_image)
    manager.register_handler("inpaint_image", handle_inpaint_image)
    logger.info("Art Extension: Handlers registered.")
