# PR Review Checklist (English)

> **PR**: AI Vision Element Finding Feature
> **Total Comments**: 20
> **Reviewers**: Copilot (AI), SrinivasanTarget (Member), KazuCocoa (Member)
> **Generated**: 2026-03-13

---

## Legend

- `[ ]` Not started
- `[/]` In progress
- `[x]` Done
- 📝 Documentation fix
- 🔧 Code fix / refactor
- 💬 Discussion / reply needed
- 💡 Optional suggestion

---

## Category A — Documentation Fixes (9 items)

---

### A1 · README.md — Inaccurate "Result Caching" and "Coordinate Scaling" descriptions

**File**: `README.md` lines 226–227
**Reviewer**: Copilot
**Type**: 📝 Documentation fix

**Problem**:
The README claims:
- **Result Caching**: Caches results for 5 minutes to avoid redundant API calls
- **Coordinate Scaling**: Automatically scales coordinates from compressed images back to original dimensions

However, the actual implementation has two issues:
1. `AIVisionFinder` is instantiated with `new AIVisionFinder()` on every request in `find.ts`, so the in-class cache (`this.cache`) is never reused across calls.
2. When `compressImage()` resizes the image (width > `imageMaxWidth`), `buildPrompt()` and `convertCoordinates()` still receive the **original** `imageWidth/imageHeight`. For `AI_VISION_COORD_TYPE=absolute`, the model sees a smaller image but coordinates are converted using original dimensions — causing mis-mapping.

**Action**:
- [ ] Update README to accurately describe current behavior:
  - Change "Result Caching" → "Result Handling: Vision results are computed on demand. The current implementation does not persist or share a cache across separate `AIVisionFinder` calls, so repeated queries may trigger repeated API requests."
  - Change "Coordinate Scaling" → "Coordinate Handling: Coordinates are returned as provided by the vision model. When `AI_VISION_COORD_TYPE` is set to `normalized` (default), values are relative (0–1000) and independent of compression; when set to `absolute`, coordinates are based on the compressed image size and are not automatically scaled back to the original resolution."

**Suggested diff**:
```diff
- - **Result Caching**: Caches results for 5 minutes to avoid redundant API calls for identical queries
- - **Coordinate Scaling**: Automatically scales coordinates from compressed images back to original dimensions for accurate tapping
+ - **Result Handling**: Vision results are computed on demand. The current implementation does not persist or share a cache across separate `AIVisionFinder` calls, so repeated queries may trigger repeated API requests.
+ - **Coordinate Handling**: Coordinates are returned as provided by the vision model. When `AI_VISION_COORD_TYPE` is set to `normalized` (default), values are relative (0–1) and independent of compression; when set to `absolute`, coordinates are based on the compressed image size and are not automatically scaled back to the original resolution.
```

---

### A2 · README.md — Broken benchmark report link

**File**: `README.md` line 221
**Reviewer**: Copilot
**Type**: 📝 Documentation fix

**Problem**:
The current link is malformed — it points to `https://github.com/appium-mcp/src/...` (incorrect domain) and has an extra trailing single-quote before the closing parenthesis:
```
[here](https://github.com/appium-mcp/src/tests/benchmark_model/TEST_REPORT.md').
```

**Action**:
- [ ] Fix the link to use a repo-relative path and remove the stray `'`:

**Suggested diff**:
```diff
- More models benchmarked can be found [here](https://github.com/appium-mcp/src/tests/benchmark_model/TEST_REPORT.md').
+ More models benchmarked can be found [here](src/tests/benchmark_model/TEST_REPORT.md).
```

---

### A5 · docs/AI_ELEMENT_FINDING_DESIGN.md — Design doc pseudo-code uses incorrect `sharp` import ✅

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` line 175
**Reviewer**: Copilot AI
**Type**: 📝 Documentation fix
**Status**: Done (changed `const { sharp } = imageUtil;` to `const sharp = imageUtil.requireSharp();` in both EN and CN design docs)

---

### A6 · docs/AI_ELEMENT_FINDING_DESIGN.md — Env vars `API_BASE_URL`/`API_TOKEN` are too generic ✅

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` lines 228–231
**Reviewer**: SrinivasanTarget
**Type**: 📝 Naming improvement
**Status**: Done (renamed `API_BASE_URL` → `AI_VISION_API_BASE_URL`, `API_TOKEN` → `AI_VISION_API_KEY` across vision-finder.ts, find.ts, vision-finder.test.ts, .vscode/launch.json)
---

### A5 · docs/AI_ELEMENT_FINDING_DESIGN_CN.md — Env variable names mismatch (Chinese doc)

**File**: `docs/AI_ELEMENT_FINDING_DESIGN_CN.md` lines 353–355
**Reviewer**: Copilot
**Type**: 📝 Documentation fix

**Problem**:
Same as A4 but in the Chinese version. The doc uses `AI_VISION_API_BASE_URL` / `AI_VISION_API_KEY` while the code reads `API_BASE_URL` / `API_TOKEN`.

**Action**:
- [ ] Update the Chinese doc to match actual env variable names (or support both names in code):

**Suggested diff**:
```diff
- - AI_VISION_API_BASE_URL：视觉模型 API 端点
- - AI_VISION_API_KEY：API 认证密钥
- - AI_VISION_MODEL：模型名称（可选，默认为 Qwen3-VL-235B-A22B-Instruct）`,
+ - API_BASE_URL（或 AI_VISION_API_BASE_URL）：视觉模型 API 端点
+ - API_TOKEN（或 AI_VISION_API_KEY）：API 认证密钥
+ - AI_MODEL（或 AI_VISION_MODEL）：模型名称（可选，默认为 Qwen3-VL-235B-A22B-Instruct）`,
```

---

### A6 · docs/AI_ELEMENT_FINDING_DESIGN_CN.md — Wrong `sharp` import in pseudo-code (Chinese doc)

**File**: `docs/AI_ELEMENT_FINDING_DESIGN_CN.md` line 383
**Reviewer**: Copilot
**Type**: 📝 Documentation fix

**Problem**:
Same as A3 but in the Chinese version. The pseudo-code uses `const { sharp } = imageUtil;` instead of the actual API.

**Action**:
- [ ] Update the Chinese doc pseudo-code:

**Suggested diff**:
```diff
- const { sharp } = imageUtil;
+ const sharp = await imageUtil.requireSharp();
```

---

### A7 · docs/AI_ELEMENT_FINDING_DESIGN.md — Document difference between `normalized` and `absolute` coordinate types ✅

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` lines 305–308
**Reviewer**: SrinivasanTarget
**Type**: 📝 Documentation addition
**Status**: Done (added detailed JSDoc on convertCoordinates in vision-finder.ts explaining both modes)

**Problem**:
The code branches on `this.config.coordType === 'normalized'` vs `'absolute'`, but there is no documentation explaining what each mode means, when to use which, and what the trade-offs are.

**Action**:
- [ ] Add a section or inline comment explaining:
  - **normalized**: Model returns coordinates in 0–1000 range; the code scales them to absolute pixels using original image dimensions. Independent of image compression.
  - **absolute**: Model returns pixel coordinates directly based on the image it sees (the compressed image). Coordinates are used as-is and are NOT scaled back to original resolution.
  - Recommendation: use `normalized` (default) unless the model explicitly requires absolute pixel output.

---

### A8 · docs/AI_ELEMENT_FINDING_DESIGN.md — Prompt should specify coordinate range when `coordType === 'normalized'` ✅

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` lines 232–235
**Reviewer**: SrinivasanTarget
**Type**: 📝 Documentation / code fix
**Status**: Done (buildPrompt in vision-finder.ts now dynamically generates coordinate instructions based on coordType)

**Problem**:
The current prompt always says "ABSOLUTE PIXEL COORDINATES" and gives the original pixel dimensions, even when `coordType === 'normalized'`. When the model is in normalized mode it should be told to use 0–1000 range, not absolute pixels.

**Action**:
- [ ] Either:
  - (Recommended) Update `buildPrompt()` in `vision-finder.ts` to conditionally include the correct coordinate instruction based on `this.config.coordType`:
    - `normalized`: "Use 0–1000 normalized coordinates (0,0 = top-left, 1000,1000 = bottom-right)"
    - `absolute`: "Use absolute pixel coordinates, Width: ${width}px, Height: ${height}px"
  - Or change the default `AI_VISION_COORD_TYPE` to `absolute` to match the current prompt wording.

---

### A9 · docs/AI_ELEMENT_FINDING_DESIGN.md — `min_pixels` / `max_pixels` are Qwen-specific parameters

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` lines 250–253
**Reviewer**: SrinivasanTarget
**Type**: 📝 Documentation addition

**Problem**:
`min_pixels` and `max_pixels` in the API request body are Qwen VL-specific parameters. Other providers (OpenAI, Gemini, etc.) will ignore or reject them. The doc does not mention this limitation.

**Action**:
- [ ] Add a note in the design doc clarifying that `min_pixels`/`max_pixels` are Qwen-specific and may not work with other providers. Consider making them conditional in the implementation (only include when model name contains "Qwen" or when a flag is set).

---

## Category B — Code Fixes (7 items)

---

### B1 · src/ai-finder/vision-finder.ts — Coordinate mis-mapping when image is compressed / MIME type mismatch on fallback ✅

**File**: `src/ai-finder/vision-finder.ts` lines 91–103
**Reviewer**: Copilot
**Type**: 🔧 Code fix (correctness)
**Status**: Done (partial — MIME type mismatch fixed; coordinate mis-mapping for absolute mode is a known limitation documented in the design doc)

**Problem**:
1. When `compressImage()` resizes the screenshot, the model receives a smaller image. For `AI_VISION_COORD_TYPE=absolute`, the model's returned coordinates are relative to the compressed image size, but the code treats them as if they were relative to the original — causing incorrect tap positions.
2. `callVisionAPI` was always invoked with `mimeType='image/jpeg'`, but `compressImage()` falls back to returning the original PNG on failure — sending PNG bytes with a JPEG MIME type declaration.

**Action**:
- [x] Fix MIME type mismatch: `compressImage()` now returns `{ base64: string; mimeType: string }`. On success: `image/jpeg`. On fallback: `image/png`. Caller passes the correct mimeType dynamically.
- [x] Fix coordinate mis-mapping for `absolute` mode: resizing is now skipped when `coordType === 'absolute'` — only JPEG quality compression is applied. This ensures the model's returned pixel coordinates always map to the original screen dimensions.

---

### B2 · src/ai-finder/vision-finder.ts — JSON regex depends on key order (`bbox_2d` must follow `target`) ✅

**File**: `src/ai-finder/vision-finder.ts` lines 338–341
**Reviewer**: SrinivasanTarget
**Type**: 🐛 Bug fix (robustness)
**Status**: Done (changed regex from `/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/` to `/\{[^}]*"bbox_2d"\s*:\s*\[[^\]]+\][^}]*\}/`, no longer order-dependent)

---

### B3 · src/tools/interactions/find.ts — New instance on every call makes cache ineffective ✅

**File**: `src/tools/interactions/find.ts` lines 116–119
**Reviewer**: SrinivasanTarget
**Type**: 🐛 Bug fix
**Status**: Done (added module-level `_finderInstance` singleton via `getAIVisionFinder()`, ensuring LRU cache persists across tool calls)

---

### B4 · src/ai-finder/vision-finder.ts — `[number, number, number, number]` tuple type used in multiple places ✅

**File**: `src/ai-finder/vision-finder.ts` lines 359–362
**Reviewer**: KazuCocoa
**Type**: 🔧 Code refactor (readability)
**Status**: Done

**Problem**:
The raw tuple type `[number, number, number, number]` is used in multiple places for bounding box coordinates. This is hard to read and easy to confuse the order of values.

**Action**:
- [ ] Define a named type in `src/ai-finder/types.ts` and reuse it:

```typescript
// In types.ts
export type BBox = [x1: number, y1: number, x2: number, y2: number];
// or as an object type:
export type BBoxObject = { x1: number; y1: number; x2: number; y2: number };
```

Then replace all occurrences of `[number, number, number, number]` in `vision-finder.ts` and related files with `BBox`.

---

### B5 · src/ai-finder/vision-finder.ts — Duplicate screenshot directory resolution logic ✅

**File**: `src/ai-finder/vision-finder.ts` line 461
**Reviewer**: KazuCocoa
**Type**: 🔧 Code refactor (DRY)
**Status**: Done

**Problem**:
`const screenshotDir = process.env.SCREENSHOTS_DIR || os.tmpdir();` duplicates the same logic that exists in `screenshot.ts`. If the logic ever changes, it needs to be updated in two places.

**Action**:
- [ ] Extract a shared utility function `resolveScreenshotDir()` (either in `screenshot.ts` and export it, or in a new `src/utils/paths.ts`) and import it in both files:

**Suggested diff**:
```diff
- const screenshotDir = process.env.SCREENSHOTS_DIR || os.tmpdir();
+ const screenshotDir = resolveScreenshotDir();
```

---

### B6 · src/ai-finder/vision-finder.ts — Use UUID instead of timestamp for annotated image filename ✅

**File**: `src/ai-finder/vision-finder.ts` lines 467–468
**Reviewer**: KazuCocoa
**Type**: 🔧 Code improvement
**Status**: Done

**Problem**:
`const filename = \`ai_vision_annotated_${Date.now()}.png\`` uses a timestamp. Timestamps can collide under high concurrency and are less unique than UUIDs. The project already imports `crypto` from `node:crypto`.

**Action**:
- [ ] Replace timestamp with `crypto.randomUUID()` (already imported):

**Suggested diff**:
```diff
- const timestamp = Date.now();
- const filename = `ai_vision_annotated_${timestamp}.png`;
+ const filename = `ai_vision_annotated_${crypto.randomUUID()}.png`;
```

---

### B7 · src/ai-finder/vision-finder.ts — Consider using `lru-cache` library (optional) ✅

**File**: `src/ai-finder/vision-finder.ts` lines 516–519
**Reviewer**: KazuCocoa
**Type**: 💡 Optional suggestion
**Status**: Done

**Problem**:
The current LRU eviction is implemented manually with `Object.keys()` iteration. The Appium project already uses the `lru-cache` npm package in other places (e.g., `packages/logger/lib/log.ts`).

**Action**:
- [ ] (Optional) Replace the manual cache implementation with `lru-cache` for correctness and simplicity. Reference: [appium/appium log.ts#L23](https://github.com/appium/appium/blob/e83e51395719108b7d02cc4f714319295b341c8b/packages/logger/lib/log.ts#L23)

---

## Category C — Discussions / Replies Needed (4 items)

---

### C1 · src/tools/interactions/click.ts — Should AI coordinate parsing apply to other interactions?

**File**: `src/tools/interactions/click.ts` lines 35–38
**Reviewer**: SrinivasanTarget
**Type**: 💬 Discussion

**Question**:
> "dont we need this logic for other interactions? like getText, longpress, etc?"

The `ai-element:` UUID prefix parsing is currently only implemented in `click.ts`. If a user finds an element via AI and then tries to call `getText`, `longPress`, or other interaction tools with the returned `ai-element:...` UUID, those tools will fail because they don't know how to handle the special format.

**Action**:
- [ ] Reply to the comment with your decision:
  - **Option A (Recommended)**: Extract the `ai-element:` UUID parsing into a shared utility function and apply it to all interaction tools that accept `elementUUID` (click, longPress, getText, etc.).
  - **Option B**: Document clearly that AI-found elements can only be used with `appium_click` for now, and other interactions require traditional element finding.

---

### C2 · src/tools/interactions/find.ts — `selector` marked optional may mislead MCP clients for traditional strategies ✅

**File**: `src/tools/interactions/find.ts` lines 17, 22–24
**Reviewer**: SrinivasanTarget
**Type**: 💬 Discussion

**Question**:
> "selector is marked optional for AI Element finding and the runtime check at bottom handles it but Zod schema no longer enforces it. JSON Schema advertised to MCP clients shows selector as optional will be misleading for traditional strategies right?"

The `selector` field is now `.optional()` in the Zod schema. MCP clients that inspect the JSON Schema will see `selector` as optional for all strategies, which is misleading — for traditional strategies (xpath, id, etc.) `selector` is actually required.

**Action**:
- [x] Reply with your approach:
  - **Option A**: Use a Zod discriminated union — when `strategy !== 'ai_instruction'`, `selector` is required; when `strategy === 'ai_instruction'`, `selector` is not needed.
  - **Option B**: Keep `selector` optional in schema but improve the description to make it clear it is required for non-AI strategies (current approach — simpler but less strict).

**Status**: Done (Option B adopted: improved `.describe()` to explicitly state selector is REQUIRED for all traditional strategies and NOT required for `ai_instruction`)

---

### C3 · docs/AI_ELEMENT_FINDING_DESIGN.md — Is the `bbox` regex reliable for all model responses?

**File**: `docs/AI_ELEMENT_FINDING_DESIGN.md` lines 272–275
**Reviewer**: SrinivasanTarget
**Type**: 💬 Discussion

**Question**:
> "does bbox always appears after target node? this seems hard to believe that it will work for all possible cases."

The regex `/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/` assumes `"target"` always appears before `"bbox_2d"` in the JSON object. JSON key order is not guaranteed.

**Action**:
- [ ] Reply explaining the current approach and whether it's sufficient:
  - The regex is a best-effort heuristic. The prompt enforces a strict output format, so in practice the model reliably follows the order.
  - The fallback regex `\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]` catches cases where the JSON format fails.
  - If more robustness is needed, consider using a more permissive regex like `/\{[^}]*"bbox_2d"\s*:\s*\[[^\]]+\][^}]*\}/` that doesn't depend on key order.

---

### C4 · docs/AI_ELEMENT_FINDING_DESIGN.md — `bbox` parsing regex: does `bbox` always appear after `target`?

> *(This is the same thread as C3 — see above.)*

---

## Priority Summary

| Priority | Items | Description |
|----------|-------|-------------|
| 🔴 P1 — Critical | B1, B2, B3 | Correctness bugs: wrong coordinates, MIME mismatch, broken cache |
| 🟠 P2 — Important | A1, A2, A4, A5, A7, A8 | Doc accuracy issues that will confuse users |
| 🟡 P3 — Normal | A3, A6, B4, B5, B6, A9 | Code quality and doc consistency |
| 🟢 P4 — Discussion | C1, C2, C3 | Need a reply/decision before closing |
| ⚪ P5 — Optional | B7 | Nice-to-have improvement |

---

## Quick Action Checklist

### Critical fixes
- [ ] B1: Fix coordinate mis-mapping when image is compressed
- [ ] B2: Fix MIME type mismatch on compression fallback
- [ ] B3: Make `AIVisionFinder` a singleton (fix broken cache)

### Documentation updates
- [ ] A1: Fix README caching/scaling descriptions
- [ ] A2: Fix broken benchmark link in README
- [ ] A3: Fix `sharp` import in EN design doc
- [ ] A4: Fix env variable names in EN design doc
- [ ] A5: Fix env variable names in CN design doc
- [ ] A6: Fix `sharp` import in CN design doc
- [ ] A7: Add normalized vs absolute coordinate explanation
- [ ] A8: Fix prompt coordinate range for normalized mode
- [ ] A9: Add note that `min_pixels`/`max_pixels` are Qwen-specific

### Code improvements
- [ ] B4: Define named `BBox` type to replace raw tuples
- [ ] B5: Extract `resolveScreenshotDir()` shared utility
- [ ] B6: Use `crypto.randomUUID()` instead of `Date.now()` for filename

### Discussion replies
- [ ] C1: Reply on AI UUID parsing for other interactions (getText, longPress, etc.)
- [ ] C2: Reply on `selector` optional schema and MCP client confusion
- [ ] C3: Reply on bbox regex reliability

### Optional
- [ ] B7: Consider replacing manual LRU with `lru-cache` library
