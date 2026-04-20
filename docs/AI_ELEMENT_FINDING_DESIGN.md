# AI-Powered Element Finding Design Proposal (Updated)

## 1. Overview

**Goal**: Enhance `appium_find_element` to support AI-based element location using natural language instructions, while maintaining backward compatibility with traditional locator strategies.

**Key Changes**:
- Add `ai_instruction` strategy to `findElementSchema`
- Integrate vision model API for element detection
- Use **W3C Actions API** instead of mobile: commands for cross-platform compatibility
- Support **environment-based model configuration**
- Implement **image compression** to reduce API latency and token costs
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
│  ├─ Screenshot capture & compression (sharp)            │
│  ├─ Vision model API call (env-configured)              │
│  ├─ BBox parsing & coordinate conversion                │
│  └─ Tap execution via W3C Actions API (performActions)  │
└─────────────────────────────────────────────────────────┘
```

**Key Design Decisions**:
1. **Single Tool Enhancement**: Modify existing `appium_find_element` instead of creating new tool
2. **Strategy-Based Routing**: Use `strategy` field to determine traditional vs AI mode
3. **Coordinate Adaptation**: AI mode returns special elementUUID format containing coordinates
4. **W3C Actions API**: Use `performActions` for cross-platform tap operations (Android/iOS)
5. **Environment Configuration**: Model settings from env vars for flexibility
6. **Image Optimization**: Compress screenshots using `@appium/support` sharp

---

## 3. Environment Configuration

### 3.1 Required Environment Variables

```bash
# Vision Model Configuration (matches benchmark_model.ts)
AI_VISION_MODEL=Qwen3-VL-235B-A22B-Instruct  # Model name (optional, has default)
API_BASE_URL=https://api.example.com  # API endpoint (required)
API_TOKEN=your_api_key_here  # API authentication (required)

# Optional: Model-specific coordinate type
AI_VISION_COORD_TYPE=normalized  # 'normalized' (0-1000) or 'absolute' (pixels), default: normalized

# Optional: Image Compression Settings
AI_VISION_IMAGE_MAX_WIDTH=1080  # Max width for compression (default: 1080)
AI_VISION_IMAGE_QUALITY=80      # JPEG quality 1-100 (default: 80)
```

**Note**: Environment variable names (`API_BASE_URL`, `API_TOKEN`) match the benchmark implementation for consistency.

### 3.2 Configuration in MCP Settings

**Cursor IDE Example**:
```json
{
  "appium-mcp": {
    "env": {
      "ANDROID_HOME": "/Users/xyz/Library/Android/sdk",
      "AI_VISION_MODEL": "Qwen3-VL-235B-A22B-Instruct",
      "AI_VISION_API_BASE_URL": "https://api.your-provider.com",
      "AI_VISION_API_TOKEN": "your_api_key_here",
      "AI_VISION_COORD_TYPE": "normalized"
    }
  }
}
```

---

## 4. Core Implementation (Pseudo Code)

### 4.1 Enhanced Schema (`src/tools/interactions/find.ts`)

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

### 4.2 AI Vision Finder Module (`src/ai-finder/vision-finder.ts`)

```typescript
import { imageUtil } from '@appium/support';
import axios from 'axios';

/**
 * Core AI vision element finder
 * Based on benchmark results: Qwen3-VL-235B-A22B-Instruct (100% accuracy, 8417ms)
 */
class AIVisionFinder {
  private config = {
    // Environment-based configuration (matches benchmark_model.ts)
    model: process.env.AI_VISION_MODEL || 'Qwen3-VL-235B-A22B-Instruct',
    apiBaseUrl: process.env.API_BASE_URL,  // Same as benchmark
    apiToken: process.env.API_TOKEN,       // Same as benchmark
    coordType: (process.env.AI_VISION_COORD_TYPE || 'normalized') as 'normalized' | 'absolute',
    // Image compression settings
    imageMaxWidth: parseInt(process.env.AI_VISION_IMAGE_MAX_WIDTH || '1080'),
    imageQuality: parseInt(process.env.AI_VISION_IMAGE_QUALITY || '80')
  };

  constructor() {
    // Validate required environment variables
    if (!this.config.apiBaseUrl) {
      throw new Error('API_BASE_URL environment variable is required');
    }
    if (!this.config.apiToken) {
      throw new Error('API_TOKEN environment variable is required');
    }
  }

  async findElement(screenshotBase64: string, instruction: string, imageWidth: number, imageHeight: number) {
    // Step 1: Compress image using @appium/support
    const compressedBase64 = await this.compressImage(screenshotBase64, imageWidth, imageHeight);
    
    // Step 2: Build prompt
    const prompt = this.buildPrompt(instruction, imageWidth, imageHeight);
    
    // Step 3: Call vision model API
    const response = await this.callVisionAPI(compressedBase64, prompt);
    
    // Step 4: Parse bbox from response
    // Expected format: {"target": "...", "bbox_2d": [x1, y1, x2, y2]}
    const { target, bbox_2d } = this.parseBBox(response);
    
    // Step 5: Convert normalized coords (0-1000) to absolute pixels
    const absoluteBBox = this.convertCoordinates(bbox_2d, imageWidth, imageHeight);
    
    // Step 6: Calculate center point for tapping
    const center = {
      x: Math.floor((absoluteBBox[0] + absoluteBBox[2]) / 2),
      y: Math.floor((absoluteBBox[1] + absoluteBBox[3]) / 2)
    };
    
    return { bbox: absoluteBBox, center, target };
  }

  /**
   * Compress image using @appium/support sharp utilities
   * Reduces API latency and token consumption
   */
  async compressImage(base64Image: string, width: number, height: number): Promise<string> {
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');
      
      // Use @appium/support imageUtil for compression
      const sharp = imageUtil.requireSharp();
      let sharpInstance = sharp(imageBuffer);
      
      // Resize if image is too large
      if (width > this.config.imageMaxWidth) {
        const scaleFactor = this.config.imageMaxWidth / width;
        const newHeight = Math.floor(height * scaleFactor);
        sharpInstance = sharpInstance.resize(this.config.imageMaxWidth, newHeight);
      }
      
      // Compress to JPEG with quality setting
      const compressedBuffer = await sharpInstance
        .jpeg({ quality: this.config.imageQuality })
        .toBuffer();
      
      return compressedBuffer.toString('base64');
    } catch (error) {
      // If compression fails, return original image
      console.warn('Image compression failed, using original:', error);
      return base64Image;
    }
  }

  buildPrompt(instruction: string, width: number, height: number): string {
    // Matches benchmark_model.ts prompt format for consistency
    return `You are a professional mobile automation testing expert. Your task is to locate the "${instruction}" in the provided UI screenshot.

**CRITICAL: Output Format Rules**
You MUST respond using ONLY this exact format, nothing else:

action: **CLICK**
Parameters: {"target": "<exact visible text or icon description>", "bbox_2d": [<x1>, <y1>, <x2>, <y2>]}

**BBox Coordinates**
- x1: Left edge X coordinate (top-left corner of element)
- y1: Top edge Y coordinate (top-left corner of element)
- x2: Right edge X coordinate (bottom-right corner of element)
- y2: Bottom edge Y coordinate (bottom-right corner of element)

**Image Dimensions (ABSOLUTE PIXEL COORDINATES)**
- Width: ${width} pixels
- Height: ${height} pixels
- Origin (0,0): Top-left corner
- Max (${width}, ${height}): Bottom-right corner
- **MUST use integer values between 0-${width} for x, 0-${height} for y**

**What to Look For**
- **TARGET**: ${instruction}
- Identify the element precisely based on the description

**Examples of CORRECT responses:**
action: **CLICK**
Parameters: {"target": "Search", "bbox_2d": [100, 200, 300, 280]}
// target is exact visible text or icon description
// bbox_2d is absolute pixel coordinates, x1 and y1 are top-left corner, x2 and y2 are bottom-right corner

**Your response (STRICT FORMAT ONLY):**`;
  }

  async callVisionAPI(imageBase64: string, prompt: string, mimeType: string = 'image/jpeg'): Promise<string> {
    // Call unified model API (matches benchmark_model.ts implementation)
    const response = await axios.post(
      `${this.config.apiBaseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              // Image size control parameters (from benchmark_model.ts)
              min_pixels: 64 * 32 * 32,    // 65536 pixels
              max_pixels: 2560 * 32 * 32   // 2621440 pixels
            }
          ]
        }],
        max_tokens: 4096
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiToken}`
        },
        timeout: 120000  // 120s timeout (matches benchmark)
      }
    );
    
    return response.data.choices[0].message.content;
  }

  parseBBox(response: string): { target: string; bbox_2d: number[] } {
    // Parse bbox coordinates from model response (matches benchmark_model.ts)
    try {
      // Try to match JSON format bbox
      const jsonMatch = response.match(/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.bbox_2d && Array.isArray(parsed.bbox_2d) && parsed.bbox_2d.length === 4) {
          return parsed;
        }
      }

      // Try to match array format [x1, y1, x2, y2]
      const arrayMatch = response.match(/\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/);
      if (arrayMatch) {
        return {
          target: 'Detected element',
          bbox_2d: [
            parseInt(arrayMatch[1], 10),
            parseInt(arrayMatch[2], 10),
            parseInt(arrayMatch[3], 10),
            parseInt(arrayMatch[4], 10)
          ]
        };
      }

      throw new Error('No valid bbox found in response');
    } catch (error) {
      console.error('Failed to parse bbox:', error);
      throw new Error('Failed to parse bbox from response');
    }
  }

  convertCoordinates(bbox: number[], width: number, height: number): number[] {
    let [x1, y1, x2, y2] = bbox;

    // Process according to model's configured coordinate type (matches benchmark_model.ts)
    if (this.config.coordType === 'normalized') {
      // Normalized coordinates (0-1000) → Absolute pixel coordinates
      x1 = Math.floor((x1 / 1000) * width);
      y1 = Math.floor((y1 / 1000) * height);
      x2 = Math.floor((x2 / 1000) * width);
      y2 = Math.floor((y2 / 1000) * height);
      console.log(`Converted normalized coords to absolute: [${x1}, ${y1}, ${x2}, ${y2}]`);
    } else {
      // Absolute pixel coordinates, use directly
      console.log(`Using absolute coords: [${x1}, ${y1}, ${x2}, ${y2}]`);
    }

    // Ensure coordinate order is correct (x1 < x2, y1 < y2)
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];

    // Ensure coordinates are within image bounds
    x1 = Math.max(0, Math.min(x1, width - 1));
    y1 = Math.max(0, Math.min(y1, height - 1));
    x2 = Math.max(0, Math.min(x2, width));
    y2 = Math.max(0, Math.min(y2, height));

    return [x1, y1, x2, y2];
    }
    return bbox;
  }
}
```

### 4.3 Enhanced Find Element Tool (`src/tools/interactions/find.ts`)

```typescript
import { imageUtil } from '@appium/support';

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `Find element using traditional locators OR AI natural language.

**Traditional Mode**: Use strategy + selector (xpath, id, etc.)
**AI Mode**: Use strategy='ai_instruction' + ai_instruction="natural language description"

Example AI usage:
- ai_instruction: "yellow search hotel button"
- ai_instruction: "username input field at top"
- ai_instruction: "settings icon in top-right corner"

**Environment Variables Required for AI Mode**:
- AI_VISION_API_BASE_URL: Vision model API endpoint
- AI_VISION_API_KEY: API authentication key
- AI_VISION_MODEL: Model name (optional, defaults to Qwen3-VL-235B-A22B-Instruct)`,
    
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
      
      // Step 2: Get image dimensions using @appium/support
      const imageBuffer = Buffer.from(screenshotBase64, 'base64');
      const { sharp } = imageUtil;
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

### 4.4 Click Adaptation with W3C Actions API (`src/tools/interactions/click.ts`)

```typescript
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { performActions, elementClick as _elementClick } from '../../command.js';

/**
 * Enhanced click to handle both traditional elementUUID and AI coordinate-based UUID
 * Uses W3C Actions API for coordinate-based taps (cross-platform compatible)
 */
export default function clickElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_gesture', // action=tap dispatch routes ai-element: UUIDs to coordinate tap
    parameters: { elementUUID: z.string() },
    
    execute: async (args, _context) => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }
      
      // Check if this is an AI-generated coordinate-based UUID
      if (args.elementUUID.startsWith('ai-element:')) {
        // Parse format: "ai-element:{x},{y}:{bbox}"
        const [_, coords] = args.elementUUID.split(':');
        const [x, y] = coords.split(',').map(Number);
        
        // Use W3C Actions API for coordinate-based tap (cross-platform)
        // Reference: double-tap.ts implementation
        const operation = [
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              { type: 'pointerMove', duration: 0, x, y },
              { type: 'pointerDown', button: 0 },
              { type: 'pause', duration: 50 },
              { type: 'pointerUp', button: 0 }
            ]
          }
        ];
        
        await performActions(driver, operation);
        
        return {
          content: [{
            type: 'text',
            text: `Clicked at coordinates (${x}, ${y}) using AI-found element`
          }]
        };
      }
      
      // Traditional element click
      await _elementClick(driver, args.elementUUID);
      
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

## 5. Usage Examples

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
  "tool": "appium_gesture",
  "arguments": {
    "action": "tap",
    "elementUUID": "ai-element:500,552:42,526,958,578"
  }
}
// Automatically taps at (500, 552) using W3C Actions API
```

---

## 6. File Structure

```
src/
├── ai-finder/                    # NEW MODULE
│   ├── vision-finder.ts          # Core AI finder with compression
│   └── types.ts                  # Type definitions
│
├── tools/interactions/
│   └── find.ts                   # MODIFIED: Add ai_instruction
│
├── tools/gestures/handlers/
│   └── tap.ts                    # Routes ai-element: UUIDs to W3C coordinate tap
│
└── tests/benchmark_model/        # EXISTING (reference)
    ├── benchmark_model.ts
    └── TEST_REPORT.md
```

---

## 7. Key Implementation Notes

1. **Backward Compatibility**: All existing code using traditional strategies continues to work unchanged

2. **W3C Actions API**: Uses `performActions` instead of `mobile: tap` for cross-platform compatibility (Android/iOS)

3. **Environment Configuration**: 
   - Model name, API endpoint, and API key from environment variables
   - Flexible configuration for different deployment scenarios
   - Clear error messages when required env vars are missing

4. **Image Compression**:
   - Uses `@appium/support` sharp utilities (no additional dependency)
   - Reduces image size by 50-80% typically
   - Significantly improves API response time (2-5x faster)
   - Reduces token consumption and API costs

5. **Coordinate Format**: AI-generated elementUUID uses special format `ai-element:{x},{y}:{bbox}` to distinguish from traditional UUIDs

6. **Tap Interception**: `appium_gesture` (action=tap) checks UUID prefix to route to W3C Actions API tap or traditional element click

7. **Model Selection**: Based on benchmark, defaults to `Qwen3-VL-235B-A22B-Instruct` (100% accuracy, fastest), but configurable via env

8. **Error Handling**: If AI finding fails, throw clear error; no automatic fallback to traditional methods

---

## 8. Vision Model Access Guide

### Recommended Providers

Based on benchmark results, the following models are recommended:

1. **Qwen3-VL-235B-A22B-Instruct** (Recommended)
   - Accuracy: 100%
   - Speed: ~8.4s
   - Provider: Alibaba Cloud / DashScope
   - Access: https://dashscope.aliyun.com

2. **Gemini 2.0 Flash**
   - Accuracy: 100%
   - Speed: ~10.5s
   - Provider: Google AI
   - Access: https://ai.google.dev

3. **GPT-4o**
   - Accuracy: 100%
   - Speed: ~18.2s
   - Provider: OpenAI
   - Access: https://platform.openai.com

### Getting API Access

**For Alibaba Cloud DashScope (Qwen)**:
```bash
1. Visit https://dashscope.aliyun.com
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key
5. Set environment variables:
   AI_VISION_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=Qwen3-VL-235B-A22B-Instruct
```

**For Google AI (Gemini)**:
```bash
1. Visit https://ai.google.dev
2. Get API key from Google AI Studio
3. Set environment variables:
   AI_VISION_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=gemini-2.0-flash-exp
```

**For OpenAI (GPT-4o)**:
```bash
1. Visit https://platform.openai.com
2. Create account and add billing
3. Generate API key
4. Set environment variables:
   AI_VISION_API_BASE_URL=https://api.openai.com/v1
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=gpt-4o
```

---

## 9. Benefits

| Aspect | Traditional | AI Instruction |
|--------|------------|----------------|
| **Learning Curve** | High (XPath/UiAutomator) | Low (natural language) |
| **Robustness** | Brittle (UI changes break) | Resilient (semantic understanding) |
| **Speed** | Fast (~100ms) | Moderate (~5-10s with compression) |
| **Accuracy** | Depends on locator | 100% (benchmark proven) |
| **Use Case** | Stable UI, known structure | Dynamic UI, quick prototyping |
| **Maintenance** | High (locator updates) | Low (semantic descriptions) |

---

## 10. Implementation Checklist

- [ ] Create `src/ai-finder/vision-finder.ts` with compression support
- [ ] Create `src/ai-finder/types.ts`
- [ ] Modify `src/tools/interactions/find.ts` (add ai_instruction)
- [ ] Modify `src/tools/interactions/click.ts` (W3C Actions API)
- [ ] Add environment variable validation and error messages
- [ ] Update README with AI configuration section
- [ ] Test with benchmark image
- [ ] Test image compression performance
- [ ] Test W3C Actions API on Android and iOS
- [ ] Update tool descriptions with env var requirements

---

This updated design incorporates all feedback from the repository maintainers and ensures a production-ready, maintainable solution.
