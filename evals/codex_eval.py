"""Evaluate Codex's MCP trajectory using ChatGPT login; Python stdlib only."""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    ("local_ios_session", "selected",
     "The local iPhone has already been selected and prepared. "
     "Start an Appium session on the selected local iPhone.",
     "appium_session_management", {"action": "create", "platform": "ios"}, []),
    ("explicit_accessibility_id", "native",
     'An Appium session is already active. Find the element whose accessibility id is "Login".',
     "appium_find_element", {"strategy": "accessibility id", "selector": "Login"}, ["appium_ai"]),
    ("no_redundant_context_discovery", "native",
     'An iOS Appium session is already active in NATIVE_APP context. '
     'Find the Login button with accessibility id "Login".',
     "appium_find_element", {"strategy": "accessibility id", "selector": "Login"},
     ["appium_ai", "appium_context"]),
]


def evaluate(events, tool, expected, forbidden):
    # Count completed items only: started/updated events repeat the same call.
    calls = [e["item"] for e in events if e.get("type") == "item.completed"
             and e.get("item", {}).get("type") == "mcp_tool_call"]
    errors = []
    if any(e.get("type") in ("error", "turn.failed") for e in events):
        errors.append("Codex runtime error; inspect events.jsonl")
    if not any(e.get("type") == "turn.completed" for e in events):
        errors.append("No completed Codex turn")
    selected = [c for c in calls if c.get("server") == "appium" and c.get("tool") == tool]
    if len(selected) != 1:
        errors.append(f"Expected exactly one {tool} call, got {len(selected)}")
    for call in selected:
        args = call.get("arguments")
        if not isinstance(args, dict):
            errors.append("Missing or malformed tool arguments")
            continue
        if any(args.get(k) != v for k, v in expected.items()):
            errors.append(f"Expected argument subset {expected}, got {args}")
        if tool == "appium_session_management" and "remoteServerUrl" in args:
            errors.append("Forbidden remoteServerUrl key")
        if call.get("status") != "completed" or call.get("error"):
            errors.append("Target MCP call failed")
    for name in forbidden:
        if any(c.get("server") == "appium" and c.get("tool") == name for c in calls):
            errors.append(f"Forbidden tool called: {name}")
    return calls, errors


def main():
    if not (ROOT / "dist/core.js").exists():
        raise SystemExit("Run npm run build first")
    env = os.environ.copy()
    # Use the existing ChatGPT login, never an API-key override.
    for name in ("CODEX_API_KEY", "OPENAI_API_KEY"):
        env.pop(name, None)
    auth = subprocess.run(["codex", "login", "status"], env=env, capture_output=True, text=True)
    if auth.returncode or "Logged in using ChatGPT" not in auth.stdout + auth.stderr:
        raise SystemExit("ChatGPT login required: run codex login before eval:codex")
    model = os.getenv("EVAL_CODEX_MODEL", "gpt-5.6-luna")
    output = ROOT / "test-reports/codex-eval" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True)
    results = []
    for name, state, prompt, tool, expected, forbidden in CASES:
        case_dir = output / name
        case_dir.mkdir()
        print(f"Running {name} with {model}…", flush=True)
        # No repository files or eval answers in the agent's working directory.
        with tempfile.TemporaryDirectory(prefix="appium-codex-eval-") as cwd:
            command = [
                "codex", "exec", "--json", "--ephemeral", "--ignore-user-config",
                "--skip-git-repo-check", "--sandbox", "read-only", "--model", model,
                "-C", cwd,
                "-c", 'forced_login_method="chatgpt"',
                "-c", 'mcp_servers.appium.command="node"',
                "-c", f'mcp_servers.appium.args={json.dumps([str(ROOT / "evals/fixture-server.mjs")])}',
                "-c", 'mcp_servers.appium.required=true',
                # This server is the device-free fixture, with all side effects intercepted.
                "-c", 'mcp_servers.appium.default_tools_approval_mode="approve"',
                "-c", f'mcp_servers.appium.env.APPIUM_EVAL_STATE="{state}"',
                "Complete the mobile automation task using the available MCP tools.\n" + prompt,
            ]
            timed_out = False
            with subprocess.Popen(command, env=env, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, start_new_session=True) as process:
                try:
                    stdout, stderr = process.communicate(timeout=180)
                except subprocess.TimeoutExpired:
                    timed_out = True
                    os.killpg(process.pid, signal.SIGKILL)
                    stdout, stderr = process.communicate()
            (case_dir / "events.jsonl").write_text(stdout)
            (case_dir / "stderr.log").write_text(stderr)
            try:
                events = [json.loads(line) for line in stdout.splitlines() if line.strip()]
                calls, errors = evaluate(events, tool, expected, forbidden)
            except json.JSONDecodeError:
                calls, errors = [], ["Invalid JSONL output from Codex"]
            if timed_out or process.returncode:
                errors.insert(0, "Codex timed out" if timed_out else f"Codex exited {process.returncode}")
            result = {"case": name, "model": model, "passed": not errors,
                      "errors": errors, "tool_calls": calls}
            results.append(result)
            (case_dir / "result.json").write_text(json.dumps(result, indent=2))
            print(f"{'FAIL' if errors else 'PASS'}: {name}", flush=True)
            for error in errors:
                print(f"  {error}", flush=True)
    (output / "results.json").write_text(json.dumps(results, indent=2))
    print(f"Reports: {output}")
    raise SystemExit(0 if all(r["passed"] for r in results) else 1)


if __name__ == "__main__":
    main()
