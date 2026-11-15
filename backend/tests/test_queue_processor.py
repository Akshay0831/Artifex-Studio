import asyncio

from utils.queue.queue_processor import QueueProcessor


def test_queue_processor_preserves_explicit_empty_config():
    processor = QueueProcessor(config={})
    try:
        assert processor.config == {}
        assert processor.rate_limiter.max_requests == 100
    finally:
        processor.thread_pool.shutdown(wait=True)


def test_queue_processor_exposes_async_handler_result():
    async def run():
        processor = QueueProcessor(config={"enable_rate_limiting": False})

        async def handler(task):
            return {"output": "async", "task_id": task.task_id}

        processor.register_task_handler("result", handler)
        task_id = await processor.enqueue_task("result", {})
        task = await processor.dequeue_task()
        assert task is not None

        try:
            await processor._process_task(task)
            info = await processor.get_task_info(task_id)
            assert info is not None
            assert info["result"] == {"output": "async", "task_id": task_id}
        finally:
            processor.thread_pool.shutdown(wait=True)

    asyncio.run(run())


def test_queue_processor_exposes_sync_handler_result():
    async def run():
        processor = QueueProcessor(config={"enable_rate_limiting": False})

        def handler(task):
            return {"output": "sync", "task_id": task.task_id}

        processor.register_task_handler("result", handler)
        task_id = await processor.enqueue_task("result", {})
        task = await processor.dequeue_task()
        assert task is not None

        try:
            await processor._process_task(task)
            info = await processor.get_task_info(task_id)
            assert info is not None
            assert info["result"] == {"output": "sync", "task_id": task_id}
        finally:
            processor.thread_pool.shutdown(wait=True)

    asyncio.run(run())
