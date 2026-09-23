import pytest

from .configuration import configure


def pytest_configure(config):
    config.appium_eval_settings = configure()


@pytest.fixture(autouse=True)
def scenario(request):
    settings = request.config.appium_eval_settings
    if not settings.model:
        pytest.skip("Set EVAL_MODEL and the provider API credential to run behavioral evals")
    state = "selected" if request.node.name == "test_local_ios_session" else "native"
    settings.mcp.servers["appium"].env["APPIUM_EVAL_STATE"] = state
