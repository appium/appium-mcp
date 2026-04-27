import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getScreenshot } from '../../command.js';
import { imageUtil } from '@appium/support';
import { AIVisionFinder } from '../../ai-finder/vision-finder.js';
import log from '../../logger.js';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
  readWebElementId,
} from '../tool-response.js';

// Module-level singleton: ensures the LRU cache persists across tool calls.
// Creating a new AIVisionFinder() on every call would reset the cache each time.
let _finderInstance: AIVisionFinder | null = null;
function getAIVisionFinder(): AIVisionFinder {
  if (!_finderInstance) {
    _finderInstance = new AIVisionFinder();
  }
  return _finderInstance;
}

export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath',
    'id',
    'name',
    'class name',
    'accessibility id',
    'css selector',
    '-android uiautomator',
    '-ios predicate string',
    '-ios class chain',
    'ai_instruction', // NEW: AI-based natural language finding
  ]),
  selector: z
    .string()
    .optional()
    .describe(
      'The selector to find the element. ' +
        'REQUIRED for all traditional strategies (xpath, id, name, class name, accessibility id, css selector, -android uiautomator, -ios predicate string, -ios class chain). ' +
        'NOT required when strategy is "ai_instruction" — use ai_instruction field instead.'
    ),
  ai_instruction: z
    .string()
    .optional()
    .describe(
      'Natural language instruction for AI-based element finding (required when strategy is ai_instruction)'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `Find a specific element by strategy and selector which will return a uuid that can be used for interactions.

**Traditional Mode**: Use strategy + selector (xpath, id, accessibility id, etc.)
**AI Mode**: Use strategy='ai_instruction' + ai_instruction="natural language description"

[PRIORITY 2: Use this to search for a target element by xpath, id, accessibility id, etc.]

**AI Mode Examples**:
- ai_instruction: "yellow search hotel button"
- ai_instruction: "username input field at top"
- ai_instruction: "settings icon in top-right corner"

**Environment Variables Required for AI Mode**:
- AI_VISION_API_BASE_URL: Vision model API endpoint (required)
- AI_VISION_API_KEY: API authentication key (required)
- AI_VISION_MODEL: Model name (optional, defaults to Qwen3-VL-235B-A22B-Instruct)
- AI_VISION_COORD_TYPE: Coordinate type (optional, defaults to normalized)

**Scrolling until an element appears**: use \`appium_gesture\` with \`action=scroll_to_element\` (same strategy + selector), not this tool.`,
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        // Route 1: Traditional locator strategy
        if (args.strategy !== 'ai_instruction') {
          if (!args.selector) {
            throw new Error(
              'selector is required for traditional locator strategies'
            );
          }
          const element = await driver.findElement(
            args.strategy,
            args.selector
          );
          const elementId = readWebElementId(element);
          if (!elementId) {
            throw new Error('Element was returned without a valid element ID');
          }
          return textResultWithPrimaryElementId(
            elementId,
            `Successfully found element ${args.selector} with strategy ${args.strategy}.`
          );
        }

        // Route 2: AI vision-based finding
        if (!args.ai_instruction) {
          throw new Error(
            'ai_instruction is required when strategy is ai_instruction. ' +
              'Example: { strategy: "ai_instruction", ai_instruction: "yellow search button at bottom" }'
          );
        }

        log.info(
          `Finding element using AI with instruction: "${args.ai_instruction}"`
        );

        // Step 1: Capture screenshot
        const screenshotBase64 = await getScreenshot(driver);

        // Step 2: Get image dimensions using @appium/support
        const imageBuffer = Buffer.from(screenshotBase64, 'base64');
        const sharp = imageUtil.requireSharp();
        const metadata = await sharp(imageBuffer).metadata();

        if (!metadata.width || !metadata.height) {
          throw new Error('Failed to get image dimensions from screenshot');
        }

        const { width, height } = metadata;

        // Step 3: Find element using AI (singleton to preserve LRU cache across calls)
        const finder = getAIVisionFinder();
        const result = await finder.findElement(
          screenshotBase64,
          args.ai_instruction,
          width,
          height
        );

        // Step 4: Create special elementUUID containing coordinates
        // Format: "ai-element:{x},{y}:{bbox}"
        const elementUUID = `ai-element:${result.center.x},${result.center.y}:${result.bbox.join(',')}`;

        // Step 5: Build response text with optional annotated image path
        let detail = `Successfully found "${result.target}" at coordinates (${result.center.x}, ${result.center.y}) using AI vision.`;

        if (result.annotatedImagePath) {
          detail += ` Vision image: ${result.annotatedImagePath}`;
        }

        return textResultWithPrimaryElementId(elementUUID, detail);
      } catch (err: unknown) {
        const errorMessage = toolErrorMessage(err);
        log.error('Failed to find element:', errorMessage);
        return errorResult(`Failed to find element. Error: ${errorMessage}`);
      }
    },
  });
}
