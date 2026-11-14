from unittest.mock import patch

from ai_models.model_training import TrainingMetrics
from app import app
from fastapi.testclient import TestClient
from routes.scaling import scaling
from routes.scaling.scaling import startup_event as scaling_startup_event
from utils.sanitization import sanitize_html
from websocket_handler import manager


def test_training_metrics_can_be_constructed_with_required_fields():
    metrics = TrainingMetrics(
        epoch=1,
        train_loss=0.25,
        learning_rate=0.001,
        train_accuracy=95.0,
    )

    assert metrics.train_loss == 0.25
    assert metrics.learning_rate == 0.001
    assert metrics.val_loss is None


def test_sanitize_html_escapes_quotes_and_removes_newlines_by_default():
    assert sanitize_html('<a title="demo">\ntext</a>') == (
        "&lt;a title=&quot;demo&quot;&gt;text&lt;/a&gt;"
    )


def test_sanitize_html_can_preserve_newlines():
    assert sanitize_html("line one\nline two", allow_newlines=True) == (
        "line one\nline two"
    )


def test_websocket_extensions_register_core_handlers():
    assert {
        "generate_image",
        "inpaint_image",
        "regenerate_audio",
        "refine_prompt",
        "analyze_scene",
        "update_project_config",
    }.issubset(manager.handlers)


def test_scaling_startup_hook_is_registered_once():
    assert app.router.on_startup.count(scaling_startup_event) == 1


def test_scaling_lifecycle_starts_and_stops_components_once():
    with patch.object(scaling.profiler, "start") as profiler_start, patch.object(
        scaling.cache_manager, "start"
    ) as cache_start, patch.object(
        scaling.queue_processor, "start"
    ) as queue_start, patch.object(
        scaling.resource_allocator, "start"
    ) as allocator_start, patch.object(
        scaling.profiler, "stop"
    ) as profiler_stop, patch.object(
        scaling.cache_manager, "stop"
    ) as cache_stop, patch.object(
        scaling.queue_processor, "stop"
    ) as queue_stop, patch.object(
        scaling.resource_allocator, "stop"
    ) as allocator_stop:
        with TestClient(app):
            pass

    for lifecycle_method in (
        profiler_start,
        cache_start,
        queue_start,
        allocator_start,
        profiler_stop,
        cache_stop,
        queue_stop,
        allocator_stop,
    ):
        lifecycle_method.assert_called_once()


def test_health_reports_the_application_version():
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["version"] == app.version
