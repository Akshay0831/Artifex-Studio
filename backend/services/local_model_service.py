import ipaddress
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit
from uuid import uuid4

import httpx


LOCAL_MODEL_PROVIDERS = {"ollama", "lm_studio"}
LOCAL_MODEL_CAPABILITIES = ["text"]


class LocalModelError(RuntimeError):
    pass


class LocalModelService:
    def __init__(self, transport: Optional[httpx.AsyncBaseTransport] = None):
        self._transport = transport

    @staticmethod
    def validate_base_url(provider: str, base_url: str) -> str:
        if provider not in LOCAL_MODEL_PROVIDERS:
            raise ValueError("Unsupported local model provider.")
        if not base_url or len(base_url) > 2048:
            raise ValueError("A local model URL is required.")

        try:
            parsed = urlsplit(base_url.strip())
            hostname = parsed.hostname
            port = parsed.port
        except ValueError as error:
            raise ValueError("The local model URL is invalid.") from error

        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Use an HTTP(S) URL without credentials, query, or fragment.")

        if hostname.lower() != "localhost":
            try:
                address = ipaddress.ip_address(hostname)
            except ValueError as error:
                raise ValueError("Local model URLs must use localhost or a loopback IP address.") from error
            if not address.is_loopback:
                raise ValueError("Local model URLs must use localhost or a loopback IP address.")

        if port is not None and not 1 <= port <= 65535:
            raise ValueError("The local model URL port is invalid.")

        path = parsed.path.rstrip("/")
        if provider == "ollama" and path:
            raise ValueError("Ollama URLs must point to the server root.")
        if provider == "lm_studio" and path not in {"", "/v1"}:
            raise ValueError("LM Studio URLs must point to the server root or its /v1 API.")

        return f"{parsed.scheme}://{parsed.netloc}{path}"

    @classmethod
    def _api_base_url(cls, provider: str, base_url: str) -> str:
        normalized = cls.validate_base_url(provider, base_url)
        if provider == "lm_studio" and not normalized.endswith("/v1"):
            normalized = f"{normalized}/v1"
        return normalized

    async def _request_json(
        self,
        provider: str,
        method: str,
        url: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Any:
        timeout = 120.0 if method == "POST" else 15.0
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.request(method, url, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise LocalModelError(
                f"{provider} returned HTTP {error.response.status_code}."
            ) from error
        except httpx.RequestError as error:
            raise LocalModelError(
                f"Could not connect to {provider}. Confirm the local runtime is running and try again."
            ) from error

        try:
            return response.json()
        except ValueError as error:
            raise LocalModelError(f"{provider} returned invalid JSON.") from error

    @staticmethod
    def _model_id(value: Any) -> Optional[str]:
        if not isinstance(value, str):
            return None
        model_id = value.strip()
        if not model_id or len(model_id) > 256 or any(ord(char) < 32 for char in model_id):
            return None
        return model_id

    async def discover_models(self, provider: str, base_url: str) -> List[Dict[str, str]]:
        api_base_url = self._api_base_url(provider, base_url)
        if provider == "ollama":
            data = await self._request_json(provider, "GET", f"{api_base_url}/api/tags")
            model_items = data.get("models") if isinstance(data, dict) else None
            name_key = "name"
        else:
            data = await self._request_json(provider, "GET", f"{api_base_url}/models")
            model_items = data.get("data") if isinstance(data, dict) else None
            name_key = "id"

        if not isinstance(model_items, list):
            raise LocalModelError(f"{provider} returned an invalid model list.")
        if len(model_items) > 500:
            raise LocalModelError(f"{provider} returned too many models to display.")

        models: List[Dict[str, str]] = []
        seen = set()
        for item in model_items:
            model_id = self._model_id(item.get(name_key) if isinstance(item, dict) else None)
            if model_id and model_id not in seen:
                seen.add(model_id)
                models.append({
                    "id": model_id,
                    "name": model_id,
                    "type": "text",
                })
        return models

    async def generate_text(
        self,
        provider: str,
        base_url: str,
        model: str,
        prompt: str,
        temperature: float = 0.4,
        system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        if provider not in LOCAL_MODEL_PROVIDERS:
            raise LocalModelError("Unsupported local model provider.")
        model_id = self._model_id(model)
        if not model_id:
            raise LocalModelError("A valid local model name is required.")
        if not prompt.strip():
            raise LocalModelError("A non-empty prompt is required.")

        api_base_url = self._api_base_url(provider, base_url)
        messages = []
        if system_prompt and system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt.strip()})
        messages.append({"role": "user", "content": prompt})

        if provider == "ollama":
            data = await self._request_json(
                provider,
                "POST",
                f"{api_base_url}/api/chat",
                {
                    "model": model_id,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": min(max(temperature, 0), 2),
                        "num_predict": 1024,
                    },
                },
            )
            message = data.get("message") if isinstance(data, dict) else None
            result = message.get("content") if isinstance(message, dict) else None
        else:
            data = await self._request_json(
                provider,
                "POST",
                f"{api_base_url}/chat/completions",
                {
                    "model": model_id,
                    "messages": messages,
                    "stream": False,
                    "temperature": min(max(temperature, 0), 2),
                    "max_tokens": 1024,
                },
            )
            choices = data.get("choices") if isinstance(data, dict) else None
            first_choice = choices[0] if isinstance(choices, list) and choices else None
            message = first_choice.get("message") if isinstance(first_choice, dict) else None
            result = message.get("content") if isinstance(message, dict) else None

        if not isinstance(result, str) or not result.strip():
            raise LocalModelError(f"{provider} returned no text for this request.")

        return {
            "id": str(uuid4()),
            "status": "completed",
            "result": result.strip(),
            "model": model_id,
            "provider": provider,
        }


local_model_service = LocalModelService()
