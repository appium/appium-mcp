from mcp_eval.evaluators import ExactToolCount, ToolCalledWith

from .generation import generate


async def test_no_redundant_context_discovery(mcp_agent):
    await generate(
        mcp_agent,
        'An iOS Appium session is already active in NATIVE_APP context. '
        'Find the Login button with accessibility id "Login".',
    )
    await mcp_agent.session.assert_that(ExactToolCount("appium_find_element", 1))
    await mcp_agent.session.assert_that(ToolCalledWith(
        "appium_find_element", {"strategy": "accessibility id", "selector": "Login"}
    ))
    await mcp_agent.session.assert_that(ExactToolCount("appium_context", 0))
    await mcp_agent.session.assert_that(ExactToolCount("appium_ai", 0))
