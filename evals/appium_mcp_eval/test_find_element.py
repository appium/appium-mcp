from mcp_eval.evaluators import ExactToolCount, ToolCalledWith

from .generation import generate


async def test_explicit_accessibility_id(mcp_agent):
    await generate(
        mcp_agent,
        'An Appium session is already active. Find the element whose accessibility id is "Login".',
    )
    await mcp_agent.session.assert_that(ExactToolCount("appium_find_element", 1))
    await mcp_agent.session.assert_that(ToolCalledWith(
        "appium_find_element", {"strategy": "accessibility id", "selector": "Login"}
    ))
    await mcp_agent.session.assert_that(ExactToolCount("appium_ai", 0))
