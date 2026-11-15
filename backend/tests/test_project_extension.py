from fastapi.testclient import TestClient

from app import app


def test_refine_prompt_websocket_rejects_missing_prompt():
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as websocket:
            websocket.send_json({"type": "refine_prompt"})
            message = websocket.receive_json()

    assert message == {
        "type": "error",
        "operation": "refine_prompt",
        "code": "INVALID_PROMPT",
        "message": "prompt must be a non-empty string",
    }
