# Appium MCP behavioral evals

`npm test` runs deterministic Jest implementation/unit/contract tests.
`npm run eval:mcp` runs three model-dependent behavioral evals with the normal
`mcp-eval` controlled agent. It is separate from Jest and required CI.

## Install and run

From the repository root (Node 22+ and Python 3.12 recommended):

```sh
npm ci
npm run build
python -m venv evals/.venv
source evals/.venv/bin/activate
python -m pip install -r evals/requirements.txt

export EVAL_PROVIDER=openai
export EVAL_MODEL=YOUR_MODEL_NAME
export OPENAI_API_KEY=YOUR_API_KEY
npm run eval:mcp
```

Alternatively set `EVAL_PROVIDER=anthropic`, an appropriate `EVAL_MODEL`, and
`ANTHROPIC_API_KEY`. Credentials use the provider's standard environment variables;
no secrets file is needed. Set a model explicitly: without `EVAL_MODEL`, cases skip.
With a model configured, credential/provider errors fail the run.
Generation traces are checked before behavioral assertions: `mcp-agent` can log
an API error and return an empty response instead of raising. A quota error such
as `429 credit_balance_exhausted` therefore means the model could not be evaluated;
it is not evidence of incorrect tool selection. Restore API quota or configure
another funded provider before retrying. The failure is recorded as
`llm_generation_succeeded` in the JSON report, without zero-call assertions.

The package is named **mcpevals**, with Python imports under `mcp_eval` and CLI
`mcp-eval`. The current published API was checked against
[upstream](https://github.com/lastmile-ai/mcp-eval) and the installed 0.1.10 source.
We use its pytest fixtures, `TestAgent.generate_str`, and deferred evaluators.
The requirements pin `mcpevals` and `mcp-agent`; MCP Python must remain below 2
because this agent release imports the removed `mcp.server.fastmcp` module.

## What is exercised

```text
pytest case -> mcp-eval TestAgent -> configured LLM
            -> Appium MCP over stdio -> OpenTelemetry -> deterministic evaluators
```

The default server is `fixture-server.mjs`, using this checkout's built
`createAppiumMcpServer`. All normal tools remain discoverable with their real
schemas/descriptions. The AI alternative is also enabled so avoiding it is a
meaningful choice. An eval-only plugin intercepts session creation and operations
outside these scenarios; it never contacts a device or vision service.

Session creation starts with a simulated selected/prepared local iPhone and no
active session. The plugin implements that precondition and creates an in-memory
session; it does not exercise device selection, WDA, or the production create
handler. Lookup cases start with an actual entry in the Appium MCP session store,
backed by a tiny fake iOS driver. Production find/context handlers execute against
that driver. Each case launches a fresh process. Prompts state the preconditions
without telling the model which tool or argument values to emit.

This tests model selection/arguments/trajectory against Appium MCP, not physical
device integration. It does not use Codex CLI or mock LLM responses.

| Case | Deterministic assertions over the complete trace |
| --- | --- |
| Local iOS session | Exactly one session-management call; argument subset `action=create`, `platform=ios`; no `remoteServerUrl` key, even with null/empty value |
| Explicit accessibility ID | Exactly one find call; `strategy=accessibility id`, `selector=Login`; zero AI calls |
| Known native context | Same find assertions; zero context calls (including list/switch); zero AI calls |

No assertions use an LLM judge. `ExactToolCount` and `ToolCalledWith` are built in;
`NoArgumentKey` is a small local evaluator. Counts cover the entire trajectory,
so a correct call followed by redundant retries still fails. Unrelated tool order
is not constrained. Each generation is limited to four agent iterations.

## Server configuration and artifacts

`EVAL_SERVER_COMMAND` defaults to `node`. `EVAL_SERVER_ARGS` is a JSON array,
defaulting to the absolute path of `evals/fixture-server.mjs`, for example:

```sh
export EVAL_SERVER_COMMAND=node
export EVAL_SERVER_ARGS='["/absolute/path/to/custom-fixture-server.mjs"]'
```

A replacement server must honor `APPIUM_EVAL_STATE=selected|native` or otherwise
establish the same preconditions before accepting requests. Pointing at an
unprepared `dist/index.js` does not seed a selected device or active session.
Additional server configuration can be set in `appium_mcp_eval/configuration.py`.
Runs are sequential; do not add pytest-xdist with this shared settings fixture.

`mcp-eval` writes JSON results and raw OTEL traces under `test-reports/mcp-eval/`.
These contain model responses/tool arguments and are ignored by Git. Preserve
the directory before another run if comparing results; names are reused.

## Credential-free validation

```sh
python -m pip check
python -m pytest -c evals/pytest.ini --collect-only evals/appium_mcp_eval
python evals/smoke.py
```

The smoke command uses `mcp-eval` to launch the configured server, discover tools,
call create/find/context directly, and check seven assertions against its OTEL
trace. It flushes tracing explicitly because direct tool calls bypass
`generate_str`'s automatic flush. It is an infrastructure check, **not** evidence
that any behavioral case passed. It requires no credentials and has a 120-second
timeout. It sets the `selected` scenario, so custom servers must support it.

Before adding an optional nightly workflow, run the three cases repeatedly with
a pinned model and review traces, variance, latency, and cost. Keep it non-blocking
initially. No workflow is added here.

## Codex with ChatGPT login

For local evaluation of **Codex's** tool use, run the same three scenarios with
Codex CLI instead of the mcp-eval agent:

```sh
codex login
npm run build
npm run eval:codex
```

This runner requires Python 3 and Codex CLI (developed with 0.151.0), but no Python
packages. It defaults to `gpt-5.6-luna`; override with `EVAL_CODEX_MODEL`.
It requires an existing ChatGPT login and removes `CODEX_API_KEY` and
`OPENAI_API_KEY` from the child environment. It uses the account's Codex limits.
No credential files are copied or modified by the runner.

Each case runs a fresh `codex exec --json` in a temporary directory with a
read-only sandbox, ignores user configuration, and registers only the built
Appium MCP fixture as a required server. It has a 180-second timeout per case.
The device-free fixture's tools are explicitly approved for non-interactive use;
this setting is scoped to that server and does not change user configuration.
The fixture and behavioral expectations are the same as the mcp-eval suite;
Codex's agent instructions and runtime differ, so these results are separate.

Assertions inspect completed MCP call events (not the final prose response):
tool name, argument subset, exact call count, forbidden argument key, and forbidden
tools. A runtime error, unsuccessful target call, or missing completed turn fails
the run. Raw JSONL events, stderr, and results are saved in a timestamped directory
under `test-reports/codex-eval/`. This runner does not produce mcp-eval OTEL traces.

This is a local opt-in command, not a CI workflow. See the official
[Codex non-interactive documentation](https://developers.openai.com/ja-JP/docs/non-interactive-mode).

Run the event-parser regression checks without any model calls:

```sh
python3 -m unittest discover -s evals -p test_codex_eval.py
```
