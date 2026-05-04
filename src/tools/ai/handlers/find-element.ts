import type { ContentResult } from 'fastmcp';
import { imageUtil } from '@appium/support';
import type { DriverInstance } from '../../../session-store.js';
import { getScreenshot } from '../../../command.js';
import { AIVisionFinder } from '../../../ai-finder/vision-finder.js';
import log from '../../../logger.js';
import {
  errorResult,
  textResultWithPrimaryElementId,
  toolErrorMessage,
} from '../../tool-response.js';
import type { AIArgs } from '../schema.js';

// Module-level singleton: ensures the LRU cache persists across tool calls.
// Creating a new AIVisionFinder() on every call would reset the cache each time.
let _finderInstance: AIVisionFinder | null = null;
export async function handleFindElement(
  driver: DriverInstance,
  args: AIArgs
): Promise<ContentResult> {
  if (!args.instruction) {
    return errorResult(
      'instruction is required for action=find_element. ' +
        'Example: { action: "find_element", instruction: "yellow search button at bottom" }'
    );
  }

  try {
    log.info(
      `Finding element using AI with instruction: "${args.instruction}"`
    );

    const screenshotBase64 = await getScreenshot(driver);

    const imageBuffer = Buffer.from(screenshotBase64, 'base64');
    const sharp = imageUtil.requireSharp();
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Failed to get image dimensions from screenshot');
    }

    const { width, height } = metadata;

    const finder = getAIVisionFinder();
    const result = await finder.findElement(
      screenshotBase64,
      args.instruction,
      width,
      height
    );

    // Format: "ai-element:{x},{y}:{bbox}" — consumed by appium_gesture handlers.
    const elementUUID = `ai-element:${result.center.x},${result.center.y}:${result.bbox.join(',')}`;

    let detail = `Successfully found "${result.target}" at coordinates (${result.center.x}, ${result.center.y}) using AI vision.`;
    if (result.annotatedImagePath) {
      detail += ` Vision image: ${result.annotatedImagePath}`;
    }

    return textResultWithPrimaryElementId(elementUUID, detail);
  } catch (err: unknown) {
    const errorMessage = toolErrorMessage(err);
    log.error('AI find_element failed:', errorMessage);
    return errorResult(`AI find_element failed. Error: ${errorMessage}`);
  }
}

function getAIVisionFinder(): AIVisionFinder {
  if (!_finderInstance) {
    _finderInstance = new AIVisionFinder();
  }
  return _finderInstance;
}
