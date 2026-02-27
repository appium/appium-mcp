# AI-Powered Element Finding Design Proposal

## 1. Overview

**Goal**: Enhance `appium_find_element` to support AI-based element location using natural language instructions, while maintaining backward compatibility with traditional locator strategies.

**Key Changes**:
- Add `ai_instruction` strategy to `findElementSchema`
- Integrate vision model API for element detection
- Adapt coordinate-based results to work with existing click operations
- Maintain full backward compatibility

---

## 2. Architecture Design

```
┌─────────────────────────────────────────────────────────┐
│  appium_find_element (Enhanced MCP Tool)                │
│  ├─ Traditional: strategy + selector → elementUUID      │
│  └─ AI Mode: ai_instruction → coordinates → tap action  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  AI Vision Finder Module                                │
│  ├─ Screenshot capture                                  │
│  ├─ Vision model API call                               │
│  ├─ BBox parsing & coordinate conversion                │
│  └─ Tap execution via driver.execute('mobile: tap')     │
└─────────────────────────────────────────────────────────┘
```

**Key Design Decisions**:
1. **Single Tool Enhancement**: Modify existing `appium_find_element` instead of creating new tool
2. **Strategy-Based Routing**: Use `strategy` field to determine traditional vs AI mode
3. **Coordinate Adaptation**: AI mode returns special elementUUID format containing coordinates
4. **Click Compatibility**: Intercept click operations to handle coordinate-based elements

---

## 3. Core Implementation (Pseudo Code)

### 3.1 Enhanced Schema (`src/tools/interactions/find.ts`)

```typescript
// BEFORE
export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath', 'id', 'name', 'class name', 'accessibility id',
    'css selector', '-android uiautomator', '-ios predicate string',
    '-ios class chain'
  ]),
  selector: z.string()
});

// AFTER
export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath', 'id', 'name', 'class name', 'accessibility id',
    'css selector', '-android uiautomator', '-ios predicate string',
    '-ios class chain',
    'ai_instruction'  // NEW: AI-based natural language finding
  ]),
  selector: z.string().optional(),  // Optional when using ai_instruction
  ai_instruction: z.string().optional()  // Natural language description
});
```

### 3.2 AI Vision Finder Module (`src/ai-finder/vision-finder.ts`)

```typescript
/**
 * Core AI vision element finder
 * Based on benchmark results: Qwen3-VL-235B-A22B-Instruct (100% accuracy, 8417ms)
 */
class AIVisionFinder {
  private config = {
    defaultModel: 'Qwen3-VL-235B-A22B-Instruct',
    coordType: 'normalized',  // 0-1000 range
    apiBaseUrl: process.env.API_BASE_URL,
    apiToken: process.env.API_TOKEN
  };

  async findElement(screenshotBase64, instruction, imageWidth, imageHeight) {
    // Step 1: Build prompt
    const prompt = this.buildPrompt(instruction, imageWidth, imageHeight);
    
    // Step 2: Call vision model API
    const response = await this.callVisionAPI(screenshotBase64, prompt);
    
    // Step 3: Parse bbox from response
    // Expected format: {"target": "...", "bbox_2d": [x1, y1, x2, y2]}
    const { target, bbox_2d } = this.parseBBox(response);
    
    // Step 4: Convert normalized coords (0-1000) to absolute pixels
    const absoluteBBox = this.convertCoordinates(bbox_2d, imageWidth, imageHeight);
    
    // Step 5: Calculate center point for tapping
    const center = {
      x: Math.floor((absoluteBBox[0] + absoluteBBox[2]) / 2),
      y: Math.floor((absoluteBBox[1] + absoluteBBox[3]) / 2)
    };
    
    return { bbox: absoluteBBox, center, target };
  }

  buildPrompt(instruction, width, height) {
    return `You are a mobile automation expert. Locate: "${instruction}"

    **Output Format (STRICT):**
    action: **CLICK**
    Parameters: {"target": "<description>", "bbox_2d": [<x1>, <y1>, <x2>, <y2>]}

    **Image Dimensions:**
    - Width: ${width}px, Height: ${height}px
    - Coordinates: absolute pixels, origin at top-left (0,0)

    **Your response:**`;
  }

  async callVisionAPI(imageBase64, prompt) {
    // Call unified model API (same as benchmark_model.ts)
    const response = await axios.post(`${this.config.apiBaseUrl}/chat/completions`, {
      model: this.config.defaultModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      }],
      max_tokens: 4096
    }, {
      headers: { Authorization: `Bearer ${this.config.apiToken}` },
      timeout: 30000
    });
    
    return response.data.choices[0].message.content;
  }

  parseBBox(response) {
    // Parse JSON format: {"target": "...", "bbox_2d": [x1, y1, x2, y2]}
    const match = response.match(/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Failed to parse bbox from response');
  }

  convertCoordinates(bbox, width, height) {
    // if coordType is not 'normalized', return as is
    // Convert normalized (0-1000) to absolute pixels
    if (this.config.coordType === 'normalized') {
      return [
        Math.floor((bbox[0] / 1000) * width),
        Math.floor((bbox[1] / 1000) * height),
        Math.floor((bbox[2] / 1000) * width),
        Math.floor((bbox[3] / 1000) * height)
      ];
    }
    return bbox;
  }
}
```

### 3.3 Enhanced Find Element Tool (`src/tools/interactions/find.ts`)

```typescript
export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `Find element using traditional locators OR AI natural language.

**Traditional Mode**: Use strategy + selector (xpath, id, etc.)
**AI Mode**: Use strategy='ai_instruction' + ai_instruction="natural language description"

Example AI usage:
- ai_instruction: "yellow search hotel button"
- ai_instruction: "username input field at top"
- ai_instruction: "settings icon in top-right corner"`,
    
    parameters: findElementSchema,
    
    execute: async (args, _context) => {
      const driver = getDriver();
      
      // Route 1: Traditional locator strategy
      if (args.strategy !== 'ai_instruction') {
        const element = await driver.findElement(args.strategy, args.selector);
        return {
          content: [{
            type: 'text',
            text: `Found element. UUID: ${element['element-6066-11e4-a52e-4f735466cecf']}`
          }]
        };
      }
      
      // Route 2: AI vision-based finding
      if (!args.ai_instruction) {
        throw new Error('ai_instruction is required when strategy is ai_instruction');
      }
      
      // Step 1: Capture screenshot
      const screenshotBase64 = await getScreenshot(driver);
      
      // Step 2: Get image dimensions
      const imageBuffer = Buffer.from(screenshotBase64, 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;
      
      // Step 3: Find element using AI
      const finder = new AIVisionFinder();
      const result = await finder.findElement(
        screenshotBase64,
        args.ai_instruction,
        width,
        height
      );
      
      // Step 4: Create special elementUUID containing coordinates
      // Format: "ai-element:{x},{y}:{bbox}"
      const elementUUID = `ai-element:${result.center.x},${result.center.y}:${result.bbox.join(',')}`;
      
      return {
        content: [{
          type: 'text',
          text: `Found "${result.target}" at coordinates (${result.center.x}, ${result.center.y}). UUID: ${elementUUID}`
        }]
      };
    }
  });
}
```

### 3.4 Click Adaptation (`src/tools/interactions/click.ts`)

```typescript
/**
 * Enhanced click to handle both traditional elementUUID and AI coordinate-based UUID
 */
export default function clickElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_click_element',
    parameters: { elementUUID: z.string() },
    
    execute: async (args, _context) => {
      const driver = getDriver();
      
      // Check if this is an AI-generated coordinate-based UUID
      if (args.elementUUID.startsWith('ai-element:')) {
        // Parse format: "ai-element:{x},{y}:{bbox}"
        const [_, coords] = args.elementUUID.split(':');
        const [x, y] = coords.split(',').map(Number);
        
        // Use mobile:tap command for coordinate-based clicking
        await driver.execute('mobile: tap', { x, y });
        
        return {
          content: [{
            type: 'text',
            text: `Clicked at coordinates (${x}, ${y})`
          }]
        };
      }
      
      // Traditional element click
      await elementClick(driver, args.elementUUID);
      
      return {
        content: [{
          type: 'text',
          text: `Clicked element ${args.elementUUID}`
        }]
      };
    }
  });
}
```

---

## 4. Usage Examples

### Traditional Mode (Unchanged)
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "xpath",
    "selector": "//android.widget.Button[@text='Search']"
  }
}
```

### AI Mode (New)
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "ai_instruction",
    "ai_instruction": "yellow search hotel button at bottom"
  }
}
// Returns: elementUUID = "ai-element:500,552:42,526,958,578"

{
  "tool": "appium_click_element",
  "arguments": {
    // TODO  not sure, but probably needs to be the same as the traditional.
    "elementUUID": "ai-element:500,552:42,526,958,578"
  }
}
// Automatically taps at (500, 552)
```

---

## 5. File Structure

```
src/
├── ai-finder/                    # NEW MODULE
│   ├── vision-finder.ts          # Core AI finder
│   └── types.ts                  # Type definitions
│
├── tools/interactions/
│   ├── find.ts                   # MODIFIED: Add ai_instruction
│   └── click.ts                  # MODIFIED: Handle coordinate-based UUID
│
└── tests/benchmark_model/        # EXISTING (reference)
    ├── benchmark_model.ts
    └── TEST_REPORT.md
```

---

## 6. Key Implementation Notes

1. **Backward Compatibility**: All existing code using traditional strategies continues to work unchanged

2. **Coordinate Format**: AI-generated elementUUID uses special format `ai-element:{x},{y}:{bbox}` to distinguish from traditional UUIDs?

3. **Click Interception**: `appium_click_element` checks UUID prefix to route to coordinate-based tap or traditional element click

4. **Model Selection**: Based on benchmark, default to `Qwen3-VL-235B-A22B-Instruct` (100% accuracy, fastest) or set in env(recommended set in env).

5. **Error Handling**: If AI finding fails, throw clear error; no automatic fallback to traditional methods

6. **Environment Variables Required**:
   - `API_BASE_URL`: Vision model API endpoint
   - `API_TOKEN`: Authentication token

---

## 7. Benefits

| Aspect | Traditional | AI Instruction |
|--------|------------|----------------|
| **Learning Curve** | High (XPath/UiAutomator) | Low (natural language) |
| **Robustness** | Brittle (UI changes break) | Resilient (semantic understanding) |
| **Speed** | Fast (~100ms) | Slower (~8-18s) |
| **Accuracy** | Depends on locator | 100% (benchmark proven) |
| **Use Case** | Stable UI, known structure | Dynamic UI, quick prototyping |

---

## 8. Implementation Checklist

- [ ] Create `src/ai-finder/vision-finder.ts`
- [ ] Create `src/ai-finder/types.ts`
- [ ] Modify `src/tools/interactions/find.ts` (add ai_instruction)
- [ ] Modify `src/tools/interactions/click.ts` (handle coordinates)
- [ ] Add environment variable validation
- [ ] Test with benchmark image
- [ ] Update tool descriptions

---

This design ensures you can implement the full solution in the next iteration while maintaining clean separation of concerns and backward compatibility.
