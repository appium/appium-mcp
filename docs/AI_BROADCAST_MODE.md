# AI Broadcast Mode

This document defines how AI agents should behave when the MCP server manages multiple Appium sessions and needs to conduct the same action against a selected group of sessions.

The core idea is simple:

- Appium parallel sessions are the transport layer.
- MCP broadcast mode is the coordination layer.

The server should keep supporting normal independent sessions, while AI agents explicitly choose when to operate on one session and when to fan out the same intent across many sessions.

## Goals

- Keep existing single-session workflows stable.
- Allow one MCP server instance to manage multiple sessions at the same time.
- Allow an AI agent to intentionally apply the same action to multiple sessions in parallel.
- Return per-session results so partial failures are visible.
- Avoid unsafe reuse of session-local state across sessions.

## Terms

### Session

An Appium session identified by a unique `sessionId` and backed by one driver instance.

### Active session

The default single session used by tools that do not specify any multi-session target.

### Session group

A named collection of session IDs that should receive the same command when broadcast mode is used.

### Broadcast mode

An explicit execution mode where the same intent is applied to a selected set of sessions, usually in parallel.

## Important distinction

The existing `getDriver()` behavior is single-session oriented. It returns the currently active driver instance and is appropriate for default single-device workflows.

Broadcast mode should not change the meaning of `getDriver()`.

Instead, broadcast mode should resolve a set of target sessions and execute the same action against each of their driver instances.

That keeps backwards compatibility intact and avoids surprising behavior in existing tools.

## Agent behavior rules

AI agents should follow these rules.

### 1. Default to single-session mode

Unless the user clearly asks for multiple devices, all devices, a session group, or a synchronized fan-out action, the agent should continue to use the active session only.

### 2. Broadcast mode must be explicit

The agent should enter broadcast mode only when one of the following is true:

- the user explicitly asks to act on all connected devices
- the user asks to act on a named group of sessions
- the tool invocation explicitly targets multiple session IDs
- a higher-level workflow explicitly requests fan-out behavior

Do not silently reinterpret a single-session tool call as a multi-session operation.

### 3. Broadcast actions should use intent-level inputs

A session-local identifier from one session is not valid for another session.

For example:

- element IDs returned by `findElement` are session-scoped
- active element references are session-scoped
- context names may differ by session

Therefore, broadcast-safe tools should prefer inputs such as:

- locator strategy + selector
- app ID or bundle ID
- deep link URL
- orientation
- text value
- key code
- screenshot request

Broadcasting an action by reusing an element UUID from one session is incorrect.

### 4. Fan out per session, not by switching global state repeatedly

The preferred execution model is:

1. Resolve target sessions.
2. Obtain each target driver instance.
3. Execute the same operation against each driver.
4. Aggregate results.

This is preferable to repeatedly mutating the active session and reusing single-session helpers for hidden parallel work.

### 5. Run in parallel, but with control

Parallel execution is the default target behavior for broadcast mode, but it should still support:

- a concurrency limit
- fail-fast or best-effort execution
- per-session timeout handling
- stable aggregation of results

Best-effort mode is the safer default for AI-agent workflows because it preserves useful results from sessions that succeed while still reporting failures.

### 6. Report per-session outcomes

Broadcast responses should always include per-session detail.

The minimum useful result shape is:

- `sessionId`
- platform
- device name
- status: `success` or `error`
- result payload if successful
- error message if failed

Agents should summarize the overall result, but not hide partial failures.

### 7. Avoid assuming all sessions are in the same UI state

Even if sessions are grouped together, their runtime state may drift.

Agents should avoid assumptions such as:

- all sessions are on the same screen
- all sessions expose the same context names
- all sessions can locate the same element immediately

If a broadcast step requires a shared state, the result should make it clear which sessions were aligned and which were not.

## Recommended target model

The server should support a target abstraction instead of overloading the active session concept.

Recommended target kinds:

- `active`
- `session`
- `group`
- `all`

Example conceptual shape:

```json
{
  "target": {
    "kind": "group",
    "groupId": "smoke-ios"
  }
}
```

Existing tools can continue to omit this field and default to `active`.

## Recommended server-side architecture

### Keep `getDriver()` as-is for single-session tools

`getDriver()` should remain the helper for the active session path.

### Add a multi-session resolver

Add a helper that resolves the actual session objects for a target.

Example conceptual API:

```ts
resolveTargetSessions(target): SessionInfo[]
```

### Add a broadcast executor

Add a helper that fans out the same operation to all resolved sessions.

Example conceptual API:

```ts
executeAcrossSessions(target, async (session) => {
  return doSomething(session.driver);
});
```

The executor should:

- resolve sessions
- run the operation per session
- support limited parallelism
- collect structured results

### Add session groups to the store

The session store already keeps multiple sessions. Broadcast mode needs one more layer: named groups.

Recommended capabilities:

- create a group from session IDs
- list groups
- update group membership
- delete groups
- optionally mark a group as selected for a broadcast workflow

## Parallel-safe session creation requirements

Multiple sessions are only reliable if driver-specific shared resources are isolated.

### Android UiAutomator2

When running sessions in parallel, ensure unique values where needed for:

- `appium:udid` or `appium:avd`
- `appium:systemPort`
- `appium:chromedriverPort` or `appium:chromedriverPorts` for webview or Chrome automation
- `appium:mjpegServerPort` when MJPEG or recording is used
- `appium:webviewDevtoolsPort` when devtools conflicts are possible

### iOS XCUITest

When running sessions in parallel, ensure unique values where needed for:

- `appium:udid`
- `appium:wdaLocalPort`
- `appium:derivedDataPath`
- `appium:mjpegServerPort` when MJPEG or recording is used

These requirements come from the Appium UiAutomator2 and XCUITest parallel test guidance and should be handled by session creation logic rather than left to the AI agent to guess every time.

## Tool design guidance

The safest rollout is to classify tools by whether their inputs are portable across sessions.

### Good candidates for broadcast mode

- activate app
- terminate app
- deep link
- screenshot
- set orientation
- press key
- tap by locator
- type or set value by locator
- scroll by direction

### Poor candidates for direct broadcast without redesign

- click by existing element UUID
- get text from an existing element UUID
- actions that depend on a previously returned session-local element handle

For these, introduce broadcast-specific variants that resolve the target independently on each session.

## Recommended response style for AI agents

When a broadcast action is executed, the response should include:

- a short overall summary
- total targeted sessions
- count of successes
- count of failures
- per-session details

Example:

```json
{
  "mode": "broadcast",
  "target": "group:smoke-android",
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {
      "sessionId": "a1",
      "deviceName": "Pixel 8",
      "status": "success"
    },
    {
      "sessionId": "b2",
      "deviceName": "Pixel 7",
      "status": "success"
    },
    {
      "sessionId": "c3",
      "deviceName": "Galaxy S24",
      "status": "error",
      "error": "Element not found"
    }
  ]
}
```

## Recommended rollout plan

1. Keep the existing active-session workflow untouched.
2. Add driver resource allocation for reliable parallel session creation.
3. Add session-group support in the store.
4. Add a reusable broadcast executor.
5. Upgrade broadcast-safe tools first.
6. Add broadcast-specific variants for tools that currently depend on session-local state.

## Summary

`getDriver()` should remain the single-session helper.

Broadcast mode should be implemented as explicit fan-out over grouped session instances, with parallel execution, per-session results, and driver-specific resource isolation handled at session creation time.

That gives AI agents a clear rule set:

- use the active session by default
- use broadcast mode only when explicitly requested
- operate on intent-level inputs when targeting multiple sessions
- report outcomes per session