"""Credential-free infrastructure check, NOT a model behavioral evaluation."""
import asyncio

from mcp_eval import TestSession
from mcp_eval.evaluators import ExactToolCount, ToolCalledWith

from appium_mcp_eval.assertions import NoArgumentKey
from appium_mcp_eval.configuration import configure


async def main():
    settings = configure()
    settings.provider = None
    settings.model = None
    settings.mcp.servers["appium"].env["APPIUM_EVAL_STATE"] = "selected"
    session = TestSession("infrastructure_smoke")
    try:
        async with session as agent:
            available = await agent.agent.list_tools()
            names = {tool.name for tool in available.tools}
            for name in ("appium_session_management", "appium_find_element", "appium_context", "appium_ai"):
                assert f"appium_{name}" in names, names
            for name, args in (
                ("appium_session_management", {"action": "create", "platform": "ios"}),
                ("appium_find_element", {"strategy": "accessibility id", "selector": "Login"}),
                ("appium_context", {"action": "list"}),
            ):
                result = await agent.agent.call_tool(f"appium_{name}", args)
                assert not result.isError, result
                if name == "appium_context":
                    assert "NATIVE_APP" in str(result)
                await session.assert_that(ExactToolCount(name, 1), name=f"count_{name}")
                await session.assert_that(ToolCalledWith(name, args), name=f"args_{name}")
            await session.assert_that(NoArgumentKey("appium_session_management", "remoteServerUrl"))
            # generate_str flushes automatically; direct smoke calls need a flush.
            await session.app.context.tracing_config.flush()
        # TestSession records results; unlike the pytest fixture it does not raise.
        assert len(session.get_results()) == 7, session.get_results()
        assert session.all_passed(), session.get_results()
        print("PASS: MCP startup, tools, native fixture, and seven OTEL assertions (no model).")
    finally:
        session.cleanup()


if __name__ == "__main__":
    asyncio.run(asyncio.wait_for(main(), timeout=120))
