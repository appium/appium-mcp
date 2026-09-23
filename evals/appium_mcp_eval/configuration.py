import json
import os
from pathlib import Path

from mcp_eval.config import MCPEvalSettings, set_settings

ROOT = Path(__file__).resolve().parents[2]


def configure():
    provider = os.getenv("EVAL_PROVIDER", "openai")
    model = os.getenv("EVAL_MODEL")
    # No file discovery: credentials come from the provider's environment variables.
    settings = MCPEvalSettings(
        provider=provider,
        model=model,
        default_agent={
            "name": "appium_behavior",
            "instruction": "Complete the user's mobile automation task using the available tools.",
            "server_names": ["appium"],
        },
        mcp={
            "servers": {
                "appium": {
                    "command": os.getenv("EVAL_SERVER_COMMAND", "node"),
                    "args": json.loads(os.getenv(
                        "EVAL_SERVER_ARGS",
                        json.dumps([str(ROOT / "evals/fixture-server.mjs")]),
                    )),
                    "env": {"APPIUM_EVAL_STATE": "native"},
                }
            }
        },
        reporting={"output_dir": str(ROOT / "test-reports/mcp-eval"), "include_traces": True},
    )
    set_settings(settings)
    return settings
