# Contributing to MCP Appium

Welcome! This guide will help you extend MCP Appium by adding new tools and resources.

## Table of Contents

- [MCP Tool Design Principles](#mcp-tool-design-principles)
- [Tool Response Contract](#tool-response-contract)
- [When to Create a New Tool vs. Consolidate](#when-to-create-a-new-tool-vs-consolidate)
- [Writing Actionable Error Messages](#writing-actionable-error-messages)
- [Adding New Tools](#adding-new-tools)
- [Adding New Resources](#adding-new-resources)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Your Tool](#testing-your-tool)
- [Formatting Best Practices](#formatting-best-practices)
- [Integrators (CI, farms, multi-session)](#integrators-ci-farms-multi-session)

---

## Integrators (CI, farms, multi-session)

End-user behavior for **multiple sessions**, **MCP client disconnect**, **remote Appium / farms**, and **tool argument logging** lives in the main **README**, under **Configuration → Integrator notes (sessions, transport, logging)**. If you change session lifecycle (`session-store`, `server` disconnect handling) or the tool logging wrapper, update that README section so it stays accurate.

---

## MCP Tool Design Principles

Before writing or extending a tool, read this section. Tools in MCP Appium are consumed by an LLM via the Model Context Protocol. Tool quality is measured not by what the tool _does_ but by **how reliably the LLM can choose and invoke it**. Three principles flow from that:

1. **One user intent = one tool.** A tool should map to a single, coherent thing the caller wants to accomplish (e.g. "control the device screen", "manage an app's lifecycle", "query device state"). Tools that bundle unrelated intents confuse tool selection.
2. **Minimal, predictable parameter surface.** Every optional parameter is a potential source of LLM confusion. Prefer ~3–5 required fields and a tight set of optionals. If you need more than ~3 conditional fields (fields that are only valid under a specific `action`), that is a signal to split the tool.
3. **Errors must teach the LLM what to do next.** The LLM reads error text and uses it to retry with adjusted parameters or to report the failure accurately to the user. `"No driver found"` gives it nothing to work with; `"No active driver session. Use appium_session_management (action=create or action=attach), or pass a valid sessionId."` lets the model recover.

These principles are grounded in the MCP specification (<https://modelcontextprotocol.io/specification/2025-11-25/server/tools>).

---

## Tool Response Contract

This section describes the **target** response contract for all tools in this repo. The shared helpers in `src/tools/tool-response.ts` land via PR #263; until the full migration completes, some existing tools still use older patterns (`throw new Error('No driver found')`, hand-built `{ content: [...] }` objects). **New tools and edits to existing tools should use this contract.** Do not copy older patterns.

The contract aligns with the MCP spec's distinction between **tool-execution errors** (the tool ran but the outcome is a failure) and **protocol errors** (malformed request, unknown tool).

### The rule

| Situation | What to return |
| --- | --- |
| Success | `{ content: [{ type: 'text', text: '...' }] }` — no `isError` field |
| Tool-execution error (no session, wrong platform, bad input past Zod, underlying Appium call failed) | `{ content: [{ type: 'text', text: '...' }], isError: true }` |
| Unknown tool / malformed request | Do nothing — FastMCP / MCP protocol layer handles this automatically |

**Never** throw for tool-execution errors. FastMCP will catch the throw and convert it to `isError: true`, but the resulting message gets prefixed with `"Tool 'xxx' execution failed: "`, which hurts the LLM's ability to parse the actual cause. Return the error explicitly.

Per the MCP TypeScript SDK spec:

> "Any errors that originate from the tool SHOULD be reported inside the result object, with `isError` set to true, _not_ as an MCP protocol-level error response. Otherwise, the LLM would not be able to see that an error occurred and self-correct."

### Shared helpers

Use the helpers in `src/tools/tool-response.ts` for every response. Do not hand-build `{ content: [...] }` objects in tool files, and do not call `getDriver()` directly — use `resolveDriver`.

```typescript
import {
  textResult,      // success: returns { content: [{type:'text', text}] }
  errorResult,     // failure: returns { content: [...], isError: true }
  toolErrorMessage, // normalize unknown error into a string
  resolveDriver,    // returns { ok: true, driver } | { ok: false, result }
  noActiveDriverSessionResult, // same "no session" copy as resolveDriver's error branch
  platformMismatch, // common "action=X is iOS-only" error helper
} from '../tool-response.js';
```

### Canonical tool body

```typescript
execute: async (args, _context): Promise<ContentResult> => {
  const resolved = resolveDriver(args.sessionId);
  if (!resolved.ok) {
    return resolved.result; // actionable "No active session..." message
  }
  const { driver } = resolved;

  // Platform gating (when needed)
  const platform = getPlatformName(driver);
  if (platform !== PLATFORM.ios) {
    return platformMismatch('shake', 'iOS', platform);
  }

  try {
    const raw = await execute(driver, 'mobile: someCall', { ...args });
    return textResult(`Action completed: ${JSON.stringify(raw)}`);
  } catch (err) {
    return errorResult(`Failed to perform action. ${toolErrorMessage(err)}`);
  }
};
```

### Why this matters

- Consistent error shape across all tools → simpler client behavior, clearer logs.
- `isError: true` is the signal the LLM uses to decide whether to retry with adjusted parameters. Losing that signal (by silently returning success-shaped text on failure) makes the agent hallucinate success.
- The `resolveDriver` + `errorResult` split produces clean, prefix-free error text that the LLM can actually parse.

---

## When to Create a New Tool vs. Consolidate

This is the most common design question in this repo. The project favors **consolidation of shared intents** (e.g. `appium_app_lifecycle` = app lifecycle with `action=activate|install|terminate|...`) but **separation of different intents** (e.g. `appium_mobile_device_control` ≠ `appium_mobile_device_info`).

### Decision rubric

Consolidate into one tool when **all** of these hold:

- The actions serve a **single user intent** at a conceptual level ("manage app lifecycle", "control the physical device", "interact with an element").
- The actions share **most** of their parameters (e.g. `id`, `name`, `sessionId`).
- Adding the action contributes **≤3 new conditional parameters** — fields only valid when `action=X`. More than that and the schema becomes noisy for every caller.
- The total number of actions stays **≤10**.

Keep tools separate when **any** of these hold:

- The actions reflect different intents (e.g. "mutate device state" vs "query device state").
- The actions have largely disjoint parameter sets.
- Consolidation would push the parent tool past ~15 total fields or ~10 actions.
- The actions happen at different points in a test flow (configuration vs. runtime vs. cleanup).

### Worked examples (from this repo)

- **`appium_app_lifecycle`** consolidates `activate / terminate / install / uninstall / list / is_installed / query_state / background / clear / deep_link`. All "app lifecycle", almost all share `id`/`name`. Good consolidation.
- **`appium_mobile_device_control`** (PR #259) consolidates `lock / unlock / shake / open_notifications` — all "control the physical device". Kept separate from `appium_mobile_device_info` (battery/model/time) which is "query device state" — different intent.
- **`appium_mobile_permissions`** should stay separate from `appium_app_lifecycle` (refer PR #270). Permissions is a distinct intent ("authorize app access") from lifecycle, and consolidation would add 7 permission-only fields, pushing `appium_app_lifecycle` past the rubric thresholds.

### When in doubt

Keep separate. The cost of splitting a tool later is low; the cost of bloating a shared tool is paid on every invocation by every caller.

---

## Writing Actionable Error Messages

The LLM reads your error text and either retries with adjusted parameters or reports the failure to the user. Error text is a contract with the LLM, not a log line for humans.

### Rules

1. **State what failed.** `"Failed to install app"`, not `"Error"`.
2. **State why.** Include the underlying cause from `toolErrorMessage(err)`.
3. **State what to try next, when recoverable.** `"Use appium_session_management (action=create or action=attach)"`, `"pass a valid sessionId"`, `"use a string like 'camera' instead of a number"`.
4. **Include the relevant parameter values** when they would help the LLM self-correct: session id, platform name, action name.
5. **No stack traces.** `toolErrorMessage` strips them; don't re-add them.

### Good vs. bad

| Bad | Good |
| --- | --- |
| `"No driver found"` | `"No active driver session. Use appium_session_management (action=create or action=attach), or pass a valid sessionId."` |
| `"Unsupported platform"` | `"action=shake is iOS-only. Current session platform is 'Android'."` |
| `"Failed"` | `"Failed to install app. ${toolErrorMessage(err)}"` |
| `"Invalid input"` | `"service must be a string name (e.g. 'camera', 'photos'), not a number."` |
| `"Error: undefined"` | (this should never happen — use `toolErrorMessage(err)`) |

### One more rule

Do not invent error prefixes per tool. Use the helpers. `errorResult(text)` prepends nothing; your text is the entire message the LLM sees.

---

## Adding New Tools

Tools are the core capabilities of MCP Appium. They define actions that can be performed on mobile devices.

### Quick Start: Simple Tool

Here is the canonical minimal tool. It uses the shared helpers from `src/tools/tool-response.ts` (see [Tool Response Contract](#tool-response-contract)) and the response contract the rest of the repo follows:

```typescript
// src/tools/my-new-tool.ts
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { execute } from '../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from './tool-response.js';

const schema = z.object({
  param1: z.string().describe('Description of param1.'),
  param2: z.number().optional().describe('Description of param2.'),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function myNewTool(server: FastMCP): void {
  server.addTool({
    name: 'appium_my_new_tool',
    description:
      'One sentence stating the user intent. ' +
      'A second sentence stating any platform or state requirements.',
    parameters: schema,
    annotations: {
      readOnlyHint: false, // true if the tool only reads device/session state
      openWorldHint: false, // true if the tool touches systems outside the device
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const raw = await execute(driver, 'mobile: someCall', {
          value: args.param1,
        });
        return textResult(`Success: ${JSON.stringify(raw)}`);
      } catch (err) {
        return errorResult(
          `Failed to perform my_new_tool. ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
```

Things to note:

- No `any` types — use `z.infer<typeof schema>` for args and `ContentResult` for the return.
- No direct `getDriver()` call — use `resolveDriver` so the "no session" path returns an actionable `isError: true` result instead of throwing.
- No hand-built `{ content: [...] }` objects — use `textResult` / `errorResult`.
- The catch block uses `toolErrorMessage` to stringify unknown errors safely (handles `Error`, string, object).

### Registering the Tool

Add your tool to `src/tools/index.ts`:

```typescript
import myNewTool from './my-new-tool.js';

export default function registerTools(server: FastMCP): void {
  // ... existing code ...

  myNewTool(server); // Add this line

  // ... rest of the tools ...
}
```

### Tool Parameters

Use Zod schemas to define parameters:

```typescript
import { z } from 'zod';

parameters: z.object({
  // Required string parameter
  requiredString: z.string().describe('A required string parameter'),

  // Optional number parameter
  optionalNumber: z.number().optional().describe('An optional number'),

  // Enum parameter
  platform: z.enum(['ios', 'android']).describe('Target platform'),

  // Object parameter
  config: z
    .object({
      key: z.string(),
      value: z.string(),
    })
    .optional()
    .describe('Configuration object'),

  // Array parameter
  items: z.array(z.string()).describe('List of items'),
});
```

### Tool Annotations

Annotations help the AI understand when to use your tool:

- `readOnlyHint: true` - Use when the tool only retrieves/reads data without modifying state
- `readOnlyHint: false` - Use when the tool performs actions or modifications
- `openWorldHint: true` - Use when the tool requires knowledge beyond the codebase
- `openWorldHint: false` - Use for codebase-specific operations

### Common Patterns

#### 1. Resolving the driver (every tool that touches a session)

```typescript
import { resolveDriver } from '../tool-response.js';

const resolved = resolveDriver(args.sessionId);
if (!resolved.ok) {
  return resolved.result; // actionable isError:true response
}
const { driver } = resolved;
```

Do **not** call `getDriver()` directly. `resolveDriver` centralizes the "no active session" error and produces a message the LLM can act on (including the `sessionId` when provided).

#### 2. Platform-specific tools

```typescript
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { platformMismatch } from '../tool-response.js';

const platform = getPlatformName(driver);

if (platform === PLATFORM.android) {
  // Android-specific implementation
} else if (platform === PLATFORM.ios) {
  // iOS-specific implementation
} else {
  // Unknown/unsupported platform — return isError:true
  return errorResult(
    `Unsupported platform: ${platform}. Supported: Android, iOS.`
  );
}
```

If your tool only supports one platform, use the shared helper instead of hand-writing the message:

```typescript
if (platform !== PLATFORM.ios) {
  return platformMismatch('shake', 'iOS', platform);
  // -> "action=shake is iOS-only. Current session platform is 'Android'."
}
```

#### 3. Driver-type checks (capability-specific tools)

```typescript
import {
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  isRemoteDriverSession,
} from '../../session-store.js';

if (isXCUITestDriverSession(driver)) {
  await (driver as XCUITestDriver).someXcuiMethod();
} else if (isAndroidUiautomator2DriverSession(driver)) {
  await (driver as AndroidUiautomator2Driver).someUiAutoMethod();
} else if (isRemoteDriverSession(driver)) {
  await execute(driver, 'mobile: someCall', {});
} else {
  return errorResult(
    `Unsupported driver type for this action. Supported: XCUITest, UiAutomator2, remote WebDriver.`
  );
}
```

---

## Adding New Resources

Resources provide contextual information to help the AI assist users better.

### Creating a Resource

```typescript
// src/resources/my-resource.ts
export default function myResource(server: any): void {
  server.addResource({
    uri: 'my://resource-uri',
    name: 'My Resource Name',
    description: 'Description of what this resource provides',
    mimeType: 'text/plain', // or 'application/json', 'text/markdown', etc.
    async load() {
      // Return the resource content
      return {
        text: 'Resource content here',
        // or
        // data: someJSONData,
      };
    },
  });
}
```

### Registering a Resource

Add your resource to `src/resources/index.ts`:

```typescript
import myResource from './my-resource.js';

export default function registerResources(server: any) {
  myResource(server); // Add this line
  console.log('All resources registered');
}
```

### Resource Types

#### Text Resource

```typescript
{
  uri: 'doc://example',
  name: 'Example Resource',
  mimeType: 'text/plain',
  async load() {
    return { text: 'Simple text content' };
  }
}
```

#### JSON Resource

```typescript
{
  uri: 'data://example',
  name: 'Example Data',
  mimeType: 'application/json',
  async load() {
    return { data: { key: 'value' } };
  }
}
```

#### Markdown Resource

```typescript
{
  uri: 'doc://guide',
  name: 'Guide',
  mimeType: 'text/markdown',
  async load() {
    return { text: '# Markdown Content' };
  }
}
```

---

## Code Style Guidelines

### 1. File Naming

- Tools: `kebab-case.ts` (e.g., `prepare-ios-simulator.ts`)
- Resources: `kebab-case.ts` (e.g., `java-template.ts`)

### 2. Function Exports

Always export as default function:

```typescript
export default function myTool(server: FastMCP): void {
  // implementation
}
```

### 3. Error Handling

See [Tool Response Contract](#tool-response-contract) for the full contract. The short version:

- **Return** `errorResult(text)` for any error that happens inside your tool. Never `throw` for expected failures (missing session, wrong platform, bad input past Zod, underlying Appium call rejected).
- Use `resolveDriver` for the "no session" path — don't hand-roll the error.
- Use `toolErrorMessage(err)` in catch blocks.
- Make the error text actionable (see [Writing Actionable Error Messages](#writing-actionable-error-messages)).

```typescript
// Good
const resolved = resolveDriver(args.sessionId);
if (!resolved.ok) return resolved.result;
const { driver } = resolved;

try {
  await execute(driver, 'mobile: foo', {});
  return textResult('foo succeeded.');
} catch (err) {
  return errorResult(`Failed to do foo. ${toolErrorMessage(err)}`);
}

// Bad — throws, produces noisy "Tool 'x' execution failed:" prefix
if (!driver) throw new Error('No driver');
```

### 4. Return Values

Always use the helpers. Do not hand-build response objects:

```typescript
// Good
return textResult('Device unlocked.');
return errorResult('action=shake is iOS-only. Current session platform is Android.');

// Bad — easy to forget isError, easy to get the shape wrong
return { content: [{ type: 'text', text: 'Device unlocked.' }] };
```

### 5. Async/Await

Always use async/await for async operations:

```typescript
// Good
const result = await driver.someMethod();

// Bad
driver.someMethod().then(result => ...)
```

### 6. Type Safety

Use proper TypeScript types — no `any` at tool boundaries:

```typescript
import type { ContentResult } from 'fastmcp';

const schema = z.object({ /* ... */ });

execute: async (
  args: z.infer<typeof schema>,
  _context: Record<string, unknown> | undefined
): Promise<ContentResult> => {
  const resolved = resolveDriver(args.sessionId);
  if (!resolved.ok) return resolved.result;
  const { driver } = resolved;
  // ...
};
```

Specifically:

- **Args**: `z.infer<typeof schema>` — keeps the tool body aligned with the schema.
- **Context**: `Record<string, unknown> | undefined` — the repo convention for the unused second arg.
- **Return**: `Promise<ContentResult>` from `fastmcp`.
- **Errors in catch blocks**: type as `unknown` and pass through `toolErrorMessage`.

---

## Examples

The tools below are useful structural references — how a tool is wired up, schema shape, `action` dispatch, platform branching, annotations, registration. **Most of them still use the pre-migration error pattern** (`throw new Error('No driver found')` or hand-built `{ content: [...] }` objects) and will be updated as the migration described in [`docs/tool-response-contract-plan.md`](./tool-response-contract-plan.md) progresses. When in doubt, follow the [Tool Response Contract](#tool-response-contract) rules above and the Quick Start template — not the current body of a sample tool.

- **Consolidated tool (`action` enum)**: `src/tools/app-management/app.ts` — multiple actions behind one tool, shared `id`/`name`, dispatched via switch. Good reference for schema + dispatch structure.
- **Platform-gated tool**: `src/tools/session/shake.ts` — iOS-only gating, sessionId handling.
- **Complex session tool**: `src/tools/session/create-session.ts` — session creation with multiple capabilities.
- **Element interaction**: `src/tools/interactions/click.ts` — selector handling and element-level error cases.
- **Prompt-based tool**: `src/tools/test-generation/generate-tests.ts` — returning AI instructions as tool output.
- **Local `textResult` pattern (pre-shared helpers)**: `src/tools/session/geolocation.ts` — uses a private local `textResult` helper. This predates the shared helpers; it demonstrates the target *shape* but imports from a local file. Once `src/tools/tool-response.ts` lands, this should migrate to the shared helper.

---

## Testing Your Tool

### 1. Static checks

```bash
npm run check   # eslint + prettier
npm run build   # tsc
```

Both must be green before opening a PR.

### 2. Unit test the response contract (recommended for non-trivial tools)

Unit tests live under `src/tests/`. A tool-level test mocks `getDriver` and asserts the `isError` / text shape. Example skeleton:

```typescript
// src/tests/tools/my-new-tool.test.ts
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../session-store.js', () => ({
  getDriver: jest.fn(),
  // ...re-export whatever else your tool imports from session-store
}));

const { getDriver } = await import('../../session-store.js');

describe('appium_my_new_tool', () => {
  it('returns isError:true when no driver is active', async () => {
    (getDriver as jest.Mock).mockReturnValue(null);
    // register your tool against a fake server, invoke it with empty args,
    // then assert result.isError === true and the text is actionable.
  });

  it('returns a success textResult when the Appium call resolves', async () => {
    (getDriver as jest.Mock).mockReturnValue({ /* fake driver */ });
    // ...
  });
});
```

Run tests:

```bash
npm run test
```

### 3. Behavioral check with the MCP Inspector

```bash
npm run build
npx @modelcontextprotocol/inspector dist/index.js
```

- Invoke your tool with no active session → expect `isError: true` and an actionable message.
- Invoke your tool normally after creating a session → expect a clean success message.
- For platform-gated tools, invoke on the wrong platform → expect `isError: true` naming both the required and the current platform.

### 4. Log verification

Look for `[TOOL START]` / `[TOOL END]` (and `[TOOL END WITH ERROR]` on `isError: true`) in the server log. These confirm the logging wrapper in `src/tools/index.ts` is receiving your tool correctly.

---

## Pre-Release Checklist

Before releasing a new version, ensure documentation and skills submodules are up to date:

### Updating Documentation And Skills Submodules

This project uses Git submodules to automatically sync documentation and agent skill content from the official Appium repositories. Before each release, you must update the submodules to ensure you have the latest markdown and image assets.

**Required steps before each release:**

1. **Update all submodules to latest commits:**

   ```bash
   ./scripts/update-submodules.sh
   ```

   This script will:

   - Update all Git submodules to their latest commits
  - Reapply sparse-checkout to only fetch `.md` and image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`)
  - Ensure you have the latest documentation and Appium skills without downloading entire repositories

2. **Re-index the documentation (if needed):**

   ```bash
   npm run build
   npm run index-docs
   ```

3. **Commit the updated submodule references:**
   ```bash
   git add .gitmodules src/resources/submodules
   git commit -m "chore: update documentation submodules"
   ```

### Why This Is Important

- **Fresh Documentation**: Ensures RAG indexing uses the latest Appium documentation
- **Fresh Skills**: Ensures environment-setup guidance stays aligned with upstream Appium agent workflows
- **Smaller Repository**: Sparse-checkout keeps repository size manageable by only fetching documentation files
- **Automatic Sync**: Submodules automatically track upstream repository commits
- **Reproducibility**: Submodule commits are tracked, ensuring consistent documentation across environments

See [SUBMODULES.md](../docs/SUBMODULES.md) for detailed information about submodule setup and usage.

---

---

## Formatting Best Practices

### Long Descriptions

For better readability when descriptions are long, use template literals with proper indentation:

**Bad (hard to read):**

```typescript
description: 'REQUIRED: First ASK THE USER which mobile platform they want to use (Android or iOS) before creating a session. DO NOT assume or default to any platform. You MUST explicitly prompt the user to choose between Android or iOS. This is mandatory before proceeding to use appium_session_management (action=create).',
```

**Good (readable):**

```typescript
description: `REQUIRED: First ASK THE USER which mobile platform they want to use (Android or iOS) before creating a session.
  DO NOT assume or default to any platform.
  You MUST explicitly prompt the user to choose between Android or iOS.
  This is mandatory before proceeding to use appium_session_management (action=create).
  `,
```

### Parameter Descriptions

For long parameter descriptions, also use template literals:

```typescript
parameters: z.object({
  platform: z.enum(['ios', 'android']).describe(
    `REQUIRED: Must match the platform the user explicitly selected via the select_device tool.
      DO NOT default to Android or iOS without asking the user first.`
  ),
});
```

---

## Further Reading

- [MCP specification — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — authoritative source for the tool response / `isError` contract.
- [MCP TypeScript SDK — `CallToolResult` JSDoc](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/core/src/types/spec.types.ts) — same contract, with the SDK author's notes.
- [Handling tool calls and errors](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — how LLM clients use `isError` to self-correct, and guidance on instructive error text.
- [FastMCP source](https://github.com/punkpeye/fastmcp/blob/main/src/FastMCP.ts) — the framework this project uses; note how it auto-converts thrown errors into `isError: true` with a `"Tool 'x' execution failed: "` prefix (the reason we prefer explicit `errorResult`).
- [`docs/tool-response-contract-plan.md`](./tool-response-contract-plan.md) — the design doc that drove the helpers in `src/tools/tool-response.ts` and the migration plan.

---

## Need Help?

- For structural reference (schema shape, registration, dispatch), see the files listed under [Examples](#examples). Note that most existing tools still use pre-migration error patterns — follow the [Tool Response Contract](#tool-response-contract) rules, not the body of a sample tool.
- See examples in `examples/`.
- Open an issue for questions.

Happy contributing! 🎉
