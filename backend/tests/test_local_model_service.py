import json

import httpx
import pytest

from services.local_model_service import LocalModelError, LocalModelService
from services.api_service import ApiService


@pytest.mark.asyncio
async def test_ollama_discovers_models_and_generates_text():
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/api/tags":
            return httpx.Response(
                200,
                json={
                    "models": [
                        {"name": "custom-model:8b"},
                        {"name": "custom-model:8b"},
                        {"name": "vision-model"},
                    ]
                },
            )
        return httpx.Response(
            200,
            json={"message": {"content": "  A rewritten prompt.  "}, "done": True},
        )

    service = LocalModelService(transport=httpx.MockTransport(handler))

    models = await service.discover_models("ollama", "http://127.0.0.1:11434")
    generated = await service.generate_text(
        "ollama",
        "http://127.0.0.1:11434",
        "custom-model:8b",
        "Rewrite the prompt.",
        temperature=0.2,
        system_prompt="Return a refined prompt.",
    )

    assert [model["id"] for model in models] == ["custom-model:8b", "vision-model"]
    assert all(model["type"] == "text" for model in models)
    assert generated["result"] == "A rewritten prompt."
    assert generated["provider"] == "ollama"
    payload = json.loads(requests[1].content)
    assert payload["model"] == "custom-model:8b"
    assert payload["options"]["temperature"] == 0.2
    assert payload["stream"] is False
    assert payload["messages"] == [
        {"role": "system", "content": "Return a refined prompt."},
        {"role": "user", "content": "Rewrite the prompt."},
    ]


@pytest.mark.asyncio
async def test_lm_studio_uses_openai_compatible_routes():
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "local/custom-model"}]})
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Generated text."}}]},
        )

    service = LocalModelService(transport=httpx.MockTransport(handler))
    models = await service.discover_models("lm_studio", "http://localhost:1234")
    generated = await service.generate_text(
        "lm_studio",
        "http://localhost:1234/v1",
        "local/custom-model",
        "Generate a short sentence.",
        system_prompt="Use concise wording.",
    )

    assert models == [{
        "id": "local/custom-model",
        "name": "local/custom-model",
        "type": "text",
    }]
    assert generated["result"] == "Generated text."
    assert requests[0].url.path == "/v1/models"
    assert requests[1].url.path == "/v1/chat/completions"
    payload = json.loads(requests[1].content)
    assert payload["messages"] == [
        {"role": "system", "content": "Use concise wording."},
        {"role": "user", "content": "Generate a short sentence."},
    ]


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com:11434",
        "http://127.0.0.1.evil:11434",
        "http://user:password@127.0.0.1:11434",
        "http://127.0.0.1:11434?target=example.com",
    ],
)
def test_local_runtime_rejects_non_local_or_ambiguous_urls(url):
    with pytest.raises(ValueError):
        LocalModelService.validate_base_url("ollama", url)


@pytest.mark.asyncio
async def test_local_runtime_reports_connection_failures_without_raw_exception():
    def handler(_request):
        raise httpx.ConnectError("private connection details")

    service = LocalModelService(transport=httpx.MockTransport(handler))

    with pytest.raises(LocalModelError, match="Confirm the local runtime is running"):
        await service.discover_models("ollama", "http://127.0.0.1:11434")


@pytest.mark.asyncio
async def test_api_service_routes_local_text_to_the_selected_runtime(monkeypatch):
    received = {}

    async def fake_generate_text(**kwargs):
        received.update(kwargs)
        return {
            "id": "local-text",
            "status": "completed",
            "result": "A generated sentence.",
        }

    monkeypatch.setattr(
        "services.api_service.local_model_service.generate_text",
        fake_generate_text,
    )
    service = ApiService()

    result = await service.make_generation_request(
        profile_id="local-profile",
        model="custom-model:8b",
        prompt="Write a sentence.",
        generation_type="text",
        provider_config={
            "api_type": "ollama",
            "base_url": "http://127.0.0.1:11434",
        },
        temperature=0.1,
    )

    assert result["result"] == "A generated sentence."
    assert received == {
        "provider": "ollama",
        "base_url": "http://127.0.0.1:11434",
        "model": "custom-model:8b",
        "prompt": "Write a sentence.",
        "temperature": 0.1,
        "system_prompt": None,
    }
