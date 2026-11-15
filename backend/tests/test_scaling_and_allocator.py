from utils.resource_allocation.smart_allocator import SmartResourceAllocator
from utils.scaling.horizontal_scaling import HorizontalScaler, LoadBalancer, ScalingConfig


def test_load_balancer_preserves_supplied_empty_instance_list():
    instances = []
    load_balancer = LoadBalancer(instances)

    assert load_balancer.instances is instances


def test_allocator_applies_defaults_to_partial_configuration():
    allocator = SmartResourceAllocator({"optimization_interval": 15})

    assert allocator.config["optimization_interval"] == 15
    assert allocator.config["default_strategy"] == "efficient"
    assert allocator.strategy is allocator.config["strategies"]["efficient"]


def test_horizontal_scaler_constructs_a_default_config():
    assert isinstance(HorizontalScaler().config, ScalingConfig)
