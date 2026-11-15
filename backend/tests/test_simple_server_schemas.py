from simple_server import ApiProfileUpdate


def test_profile_update_schema_supports_partial_updates():
    assert ApiProfileUpdate().model_dump(exclude_unset=True) == {}
    assert ApiProfileUpdate(name="Updated profile").model_dump(exclude_unset=True) == {
        "name": "Updated profile"
    }
