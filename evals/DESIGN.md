# Appium MCP Behavioral Evaluation Design

This document describes the testing model used for Appium MCP behavioral evaluations, the implementation strategy introduced in this repository, and the evaluation frameworks considered.

The goal is not to replace existing unit tests. It is to extend testing from deterministic implementation correctness toward model-driven MCP behavior and, eventually, real-client end-to-end compatibility.

## 1. Testing model

Appium MCP testing is divided into layers.

```text
Level 1: Code-level deterministic tests
         ↓
Level 2: MCP behavioral integration
         ↓
Level 3: Real-client integration
```

Each layer answers a different question.

### Level 1 — Code-level deterministic tests

These are the existing Jest tests.

They validate implementation behavior such as:

- tool execution
- input validation
- session state transitions
- driver interaction
- error handling
- plugin lifecycle
- MCP registration
- tool schema and descriptions
- LLM-facing wording contracts

Examples include:

```text
src/tests/tools/session/
src/tests/tools/context/
src/tests/tools/llm-wording.test.ts
src/tests/create-server.test.ts
```

These tests answer:

> If a tool is called with these arguments and this state, does Appium MCP behave correctly?

They intentionally do not involve an LLM.

This layer should remain fast, deterministic, inexpensive, and suitable for required CI.

---

## 2. MCP behavioral integration

The next layer evaluates whether an actual model can correctly use the MCP interface.

This is different from testing the tool implementation itself.

It evaluates questions such as:

- Does the model select the correct tool?
- Does it provide the expected arguments?
- Does it avoid invalid or invented arguments?
- Does it choose an unnecessarily expensive alternative?
- Does it repeat tool calls unnecessarily?
- Does it follow an efficient tool trajectory?

For example, the existing wording test can verify that the description of `appium_session_management` contains guidance such as not inventing a localhost remote server URL.

A behavioral eval verifies the consequence:

```text
User:
Start an Appium session on the selected local iPhone.

Expected model behavior:
appium_session_management({
  action: "create",
  platform: "ios"
})

Forbidden:
remoteServerUrl
```

The distinction is:

```text
wording contract:
"the instruction exists"

behavioral eval:
"the model actually follows the instruction"
```

Both are useful and should remain separate.

---

## 3. Initial behavioral scenarios

The first behavioral eval suite intentionally covers a small number of cases.

### Local iOS session creation

Validates:

- `appium_session_management` is selected
- `action=create`
- `platform=ios`
- `remoteServerUrl` is not invented
- session management is not redundantly called

### Explicit accessibility ID lookup

For a prompt that explicitly provides an accessibility ID:

```text
Find the element whose accessibility id is "Login".
```

Validates:

- `appium_find_element` is selected
- `strategy=accessibility id`
- `selector=Login`
- `appium_ai` is not used unnecessarily
- repeated find attempts do not occur

### Known native context

For an already-active native session:

```text
Find the Login button with accessibility id "Login".
```

Validates:

- normal element lookup is used
- `appium_context` is not called merely to rediscover the known native context
- `appium_ai` is not used unnecessarily

This case is important because task success alone would not detect regressions such as:

```text
appium_context(list)
appium_find_element(...)
appium_context(list)
...
```

The task may still succeed, but the trajectory is unnecessarily expensive and complex.

---

## 4. Behavioral eval fixture boundary

The behavioral suite uses the real Appium MCP server surface wherever practical.

The following remain real:

- tool discovery
- tool names
- tool descriptions
- schemas
- MCP registration
- production `find` handling
- production context handling
- session store behavior

The physical device boundary is replaced by a small fixture.

This avoids requiring:

- a real simulator/device
- WebDriverAgent
- UiAutomator2
- an Appium server process
- a vision provider

The purpose of these tests is not to verify device integration.

That remains the responsibility of code-level and device integration tests.

The fixture exists so that the behavioral test isolates:

```text
model
  ↓
MCP interface
  ↓
tool selection
  ↓
arguments
  ↓
trajectory
```

rather than device availability.

---

## 5. Controlled-agent evaluation

The primary behavioral suite uses `mcp-eval`.

The execution path is:

```text
pytest scenario
    ↓
mcp-eval TestAgent
    ↓
configured LLM
    ↓
Appium MCP over stdio
    ↓
OpenTelemetry trace
    ↓
deterministic assertions
```

OpenTelemetry is important because the final text response is not sufficient evidence of MCP behavior.

The trace provides evidence of:

- tools called
- call order
- arguments
- repeated calls
- execution results
- model/runtime failures

Initial assertions intentionally remain deterministic.

Examples include:

- exact tool-call count
- required argument subset
- forbidden argument key
- forbidden tool
- generation/runtime success

No LLM judge is required for the initial cases.

This keeps failures interpretable.

---

## 6. Real-client integration

A controlled agent tells us whether the MCP interface is usable by a model under a reproducible harness.

It does not tell us exactly how a specific client behaves.

For that reason, real-client evaluation is a separate layer.

The initial client integration uses Codex CLI:

```text
Codex CLI
    ↓
Appium MCP
    ↓
fixture
```

The same behavioral scenarios are executed, but assertions are made against Codex's MCP call events rather than the mcp-eval trace.

This answers a different question:

> Does Codex, as an actual MCP client and agent runtime, use Appium MCP as expected?

The distinction is intentional:

```text
mcp-eval:
MCP interface behavioral quality

Codex eval:
Codex-specific compatibility
```

A future suite could similarly cover other clients without changing the controlled-agent suite.

---

## 7. CI strategy

The testing layers have different operational characteristics.

### Required CI

Code-level deterministic tests are appropriate for normal required CI.

They are:

- fast
- reproducible
- credential-free
- inexpensive
- independent of external model availability

### Model behavioral evals

Model-driven evaluations depend on:

- provider availability
- credentials
- quota
- model behavior
- latency
- model version

They should initially be run manually or in non-blocking scheduled workflows.

Once a model and scenario set are sufficiently stable, selected behavioral checks may become CI signals.

They should still remain separate from `npm test`.

### Real-client integration

Client integration adds further dependencies such as:

- Codex CLI version
- authenticated client state
- client runtime behavior
- account limits

These are better suited to:

- local qualification
- periodic compatibility runs
- non-blocking scheduled CI

rather than required pull-request checks.

---

## 8. Metrics and efficiency

Behavioral correctness is the primary requirement.

Efficiency metrics are secondary but useful.

Potential metrics include:

- tool-call count
- redundant-call count
- input tokens
- output tokens
- total tokens
- tool-result payload size
- latency
- cost

These should initially be collected as observations rather than hard pass/fail thresholds.

A useful ordering is:

```text
1. task correctness
2. tool correctness
3. trajectory correctness
4. efficiency
```

Token counts in particular should generally be compared against a baseline for the same model rather than using one global absolute threshold.

Different models have different tokenization and tool-use behavior.

This also suggests two separate comparisons:

```text
MCP regression:
same model
same scenarios
before vs after MCP change

Model qualification:
same MCP revision
same scenarios
old model vs new model
```

---

## 9. Documentation plugin evaluation

Appium MCP can also expose documentation-related tools through the documentation plugin.

Documentation evaluation requires additional quality dimensions.

For automation tools, the primary question is:

> Did the correct action occur?

For documentation tools, the path is more like:

```text
user question
    ↓
tool selection
    ↓
query generation
    ↓
retrieval
    ↓
answer synthesis
```

This creates additional evaluation layers.

### Tool routing

Was the correct documentation tool selected?

### Query quality

Did the model generate a useful documentation query?

### Retrieval correctness

Did the retrieved result contain the expected document, section, or facts?

This can often be checked deterministically.

### Answer correctness

Did the final answer contain the expected information?

### Groundedness

Is the answer supported by the retrieved documentation rather than invented?

The first behavioral suite does not yet attempt to solve all of these.

Documentation evaluation should be added incrementally after the basic MCP behavioral harness is stable.

Semantic graders may become useful for answer correctness and groundedness, while tool routing and expected source presence should remain deterministic where possible.

---

## 10. Frameworks considered

Several general-purpose evaluation frameworks were considered.

### [mcp-eval](https://github.com/lastmile-ai/mcp-eval)

Selected for the initial behavioral suite.

Reasons:

- MCP-focused
- launches an actual agent against an MCP server
- captures execution with OpenTelemetry
- supports tool-call assertions
- supports argument inspection
- supports tool-count and trajectory evaluation
- fits Appium's stateful multi-tool behavior well

It is especially useful for cases where the final task succeeds but the trajectory is poor.

Example:

```text
expected:
find_element → interaction

undesired:
context → page_source → find_element → context → interaction
```

### [DeepEval](https://deepeval.com/)

Considered and potentially useful for future evaluation.

Strengths:

- MCP-aware evaluation primitives
- semantic evaluation
- argument quality evaluation
- RAG-related metrics
- groundedness and answer-quality metrics

It may be particularly useful once documentation-plugin evaluation is introduced.

It was not required for the initial behavioral cases because those cases can be evaluated with deterministic trace assertions.

### [Promptfoo](https://www.promptfoo.dev/)

Considered as a general LLM evaluation and CI framework.

Strengths:

- simple scenario definition
- model comparison
- strong CI integration
- custom assertions

It is less directly centered around MCP execution trajectories than mcp-eval, so it was not selected as the initial Appium MCP behavioral harness.

### [Braintrust](https://www.braintrust.dev/) / [LangSmith](https://docs.langchain.com/langsmith/observability)

Considered for broader experiment tracking and observability.

They are useful for:

- large evaluation datasets
- trace analysis
- experiment comparison
- latency/cost monitoring
- production-like observability

They introduce more infrastructure than required for the initial proof of concept.

They may become useful if Appium MCP develops a large long-running model qualification suite.

### [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)

Useful for interactive MCP protocol and tool validation.

It answers questions such as:

- Is the server discoverable?
- Is the schema exposed correctly?
- Can the tool be invoked manually?

It does not answer:

> Will an LLM independently choose and call the correct tool?

Therefore it complements, but does not replace, behavioral evaluation.

### Real MCP clients

Clients such as [Codex CLI](https://github.com/openai/codex) are not replacements for the controlled evaluation harness.

They provide a separate compatibility layer.

Their behavior includes client-specific:

- agent instructions
- planning
- tool policies
- context handling
- runtime changes

They are therefore evaluated separately.

---

## 11. Why not use only end-to-end tests?

It is tempting to test only:

```text
prompt
→ Codex
→ Appium MCP
→ final result
```

but this makes failures difficult to diagnose.

A failed answer could originate from:

- tool implementation
- tool description
- schema
- model routing
- argument generation
- retrieval
- client behavior
- runtime behavior

The layered approach preserves failure isolation.

```text
code-level test fails
→ implementation problem

mcp-eval fails
→ MCP/model-interface problem

Codex-only eval fails
→ client-specific problem
```

This separation is the main reason for maintaining all three levels.

---

## 12. Current scope

The initial implementation intentionally remains small.

It establishes:

- a controlled model-driven MCP evaluation path
- deterministic tool-call assertions
- OpenTelemetry-backed trajectory inspection
- a device-free Appium fixture
- a separate Codex compatibility runner

It does not yet attempt to establish:

- a generic Appium evaluation framework
- a universal quality score
- token-budget gates
- model ranking
- documentation RAG grading
- required model-dependent PR checks

Those can be added after the initial behavioral suite proves stable and useful.

The intended progression is:

```text
code correctness
    ↓
MCP behavioral correctness
    ↓
client compatibility
    ↓
retrieval / answer quality
    ↓
efficiency and model qualification
```
