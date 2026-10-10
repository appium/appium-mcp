import {imageUtil} from '@appium/support';
import type {ContentResult} from 'fastmcp';

import {AIVisionFinder} from '../../../ai-finder/vision-finder.js';
import {getScreenshot, getWindowSize} from '../../../command.js';
import log from '../../../logger.js';
import {getPlatformName, PLATFORM} from '../../../session-store.js';
import type {DriverInstance} from '../../../session-store.js';
import {errorResult, textResultWithPrimaryElementId, toolErrorMessage} from '../../tool-response.js';
import type {AIArgs} from '../schema.js';

// Module-level singleton: ensures the LRU cache persists across tool calls.
// Creating a new AIVisionFinder() on every call would reset the cache each time.
let _finderInstance: AIVisionFinder | null = null;

export async function handleFindElement(driver: DriverInstance, args: AIArgs): Promise<ContentResult> {
  // `instruction` presence/non-emptiness is enforced at schema level via
  // `aiSchema.superRefine`. Narrow the optional type here for downstream calls.
  const instruction = args.instruction as string;

  try {
    log.info(`Finding element using AI with instruction: "${instruction}"`);

    const screenshotBase64 = await getScreenshot(driver);

    const imageBuffer = Buffer.from(screenshotBase64, 'base64');
    const sharp = imageUtil.requireSharp();
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Failed to get image dimensions from screenshot');
    }

    const {width, height} = metadata;

    const finder = getAIVisionFinder();
    const result = await finder.findElement(screenshotBase64, instruction, width, height);

    // Vision results and annotations use screenshot pixels, but iOS touch actions
    // use logical screen coordinates. Do not mutate the finder's cached result.
    let center = result.center;
    let bbox = result.bbox;
    if (getPlatformName(driver) === PLATFORM.ios) {
      const screen = await getWindowSize(driver);
      if (!(screen.width > 0 && screen.height > 0)) {
        throw new Error('Failed to get screen dimensions for AI coordinate mapping');
      }
      const scaleX = screen.width / width;
      const scaleY = screen.height / height;
      center = {x: Math.floor(center.x * scaleX), y: Math.floor(center.y * scaleY)};
      bbox = [
        Math.floor(bbox[0] * scaleX),
        Math.floor(bbox[1] * scaleY),
        Math.ceil(bbox[2] * scaleX),
        Math.ceil(bbox[3] * scaleY),
      ];
    }

    // Format: "ai-element:{x},{y}:{bbox}" — consumed by appium_gesture handlers.
    const elementUUID = `ai-element:${center.x},${center.y}:${bbox.join(',')}`;

    let detail = `Successfully found "${result.target}" at coordinates (${center.x}, ${center.y}) using AI vision.`;
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
