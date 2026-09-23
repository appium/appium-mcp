from mcp_eval.evaluators import ExactToolCount, ToolCalledWith

from .assertions import NoArgumentKey
from .generation import generate


async def test_local_ios_session(mcp_agent):
    await generate(
        mcp_agent,
        "The local iPhone has already been selected and prepared. "
        "Start an Appium session on the selected local iPhone.",
    )
    await mcp_agent.session.assert_that(ExactToolCount("appium_session_management", 1))
    await mcp_agent.session.assert_that(ToolCalledWith(
        "appium_session_management", {"action": "create", "platform": "ios"}
    ))
    await mcp_agent.session.assert_that(NoArgumentKey("appium_session_management", "remoteServerUrl"))
