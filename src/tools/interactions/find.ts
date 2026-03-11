import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { getScreenshot } from '../../command.js';
import { imageUtil } from '@appium/support';
import { AIVisionFinder } from '../../ai-finder/vision-finder.js';
import log from '../../logger.js';

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
      'The selector to find the element (required for traditional strategies)'
    ),
  ai_instruction: z
    .string()
    .optional()
    .describe(
      'Natural language instruction for AI-based element finding (required when strategy is ai_instruction)'
    ),
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
- API_BASE_URL: Vision model API endpoint (required)
- API_TOKEN: API authentication key (required)
- AI_VISION_MODEL: Model name (optional, defaults to Qwen3-VL-235B-A22B-Instruct)
- AI_VISION_COORD_TYPE: Coordinate type (optional, defaults to normalized)`,
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

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
          return {
            content: [
              {
                type: 'text',
                text: `Successfully found element ${args.selector} with strategy ${args.strategy}. Element id ${element['element-6066-11e4-a52e-4f735466cecf']}`,
              },
            ],
          };
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
          content: [
            {
              type: 'text',
              text: `Successfully found "${result.target}" at coordinates (${result.center.x}, ${result.center.y}) using AI vision. Element id ${elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        const errorMessage = err.message || err.toString();
        log.error('Failed to find element:', errorMessage);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find element. Error: ${errorMessage}`,
            },
          ],
        };
      }
    },
  });
}
