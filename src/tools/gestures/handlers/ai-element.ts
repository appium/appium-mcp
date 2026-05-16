/**
 * Helpers for the special "ai-element:" UUIDs produced by the appium_ai
 * find_element handler.
 *
 * The format is:
 *
 *   ai-element:<cx>,<cy>:<x0>,<y0>,<x1>,<y1>
 *
 * where (cx, cy) is the visual centre of the target and (x0,y0,x1,y1) is
 * the bounding box returned by the vision model. Both are pixel
 * coordinates in the screenshot's coordinate space, NOT real WebDriver
 * element ids — so they MUST NOT be passed to driver.getElementRect or
 * to platform-native commands like `mobile: doubleTap`, `mobile: pinch`,
 * etc., which require a real element id.
 *
 * Centralising the prefix, the parser, and the rect-resolution helper
 * here keeps every gesture handler honest: if it ever needs a rect for
 * a UUID, it goes through `resolveTargetRect` and gets the right thing
 * for both AI and traditional UUIDs.
 */
import type { ContentResult } from 'fastmcp';
import type { Rect } from '@appium/types';
import { getElementRect } from '../../../command.js';
import type { DriverInstance } from '../../../session-store.js';
import { errorResult } from '../../tool-response.js';

export const AI_ELEMENT_PREFIX = 'ai-element:';

export const AI_DISABLED_REJECTION =
  `Received an ai-element: UUID, but the appium_ai tool is not registered ` +
  `(AI_VISION_ENABLED is not set to true). Use appium_find_element to get a real ` +
  `element UUID, or enable AI_VISION_ENABLED=true with the required AI_VISION_* keys.`;

export type ParsedAiElement = {
  center: { x: number; y: number };
  rect: Rect;
};

export function isAiElementUUID(uuid: string | undefined): uuid is string {
  return typeof uuid === 'string' && uuid.startsWith(AI_ELEMENT_PREFIX);
}

/**
 * Parse an `ai-element:` UUID into a centre point and a synthetic rect.
 *
 * If the bbox segment is present and well-formed, the rect describes the
 * full bounding box. Otherwise we fall back to a 1×1 rect at the centre,
 * so callers that only need a single point still work.
 */
export function parseAiElement(
  uuid: string
): ParsedAiElement | { error: string } {
  const parts = uuid.split(':');
  if (parts.length < 2) {
    return { error: 'Invalid ai-element UUID: missing coordinate segment.' };
  }

  const [cxStr, cyStr] = (parts[1] ?? '').split(',');
  const cx = Number.parseInt(cxStr ?? '', 10);
  const cy = Number.parseInt(cyStr ?? '', 10);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return {
      error: `Invalid ai-element UUID: centre coordinates are not numbers ('${parts[1]}').`,
    };
  }

  let rect: Rect = { x: cx, y: cy, width: 1, height: 1 };
  if (parts[2]) {
    const bbox = parts[2].split(',').map((v) => Number.parseInt(v, 10));
    if (
      bbox.length === 4 &&
      bbox.every((n) => Number.isFinite(n)) &&
      bbox[2] > bbox[0] &&
      bbox[3] > bbox[1]
    ) {
      rect = {
        x: bbox[0],
        y: bbox[1],
        width: bbox[2] - bbox[0],
        height: bbox[3] - bbox[1],
      };
    }
  }

  return { center: { x: cx, y: cy }, rect };
}

/**
 * Single dispatcher for "give me a rect for this UUID":
 *   - ai-element UUID → rect synthesised from the bbox/centre, no driver call
 *   - traditional UUID → driver.getElementRect, as before
 *
 * Returning `{ error }` instead of throwing keeps the handler call sites
 * consistent with how they already shape their other failure modes.
 */
export async function resolveTargetRect(
  driver: DriverInstance,
  elementUUID: string
): Promise<Rect | { error: string }> {
  if (isAiElementUUID(elementUUID)) {
    const parsed = parseAiElement(elementUUID);
    if ('error' in parsed) {
      return parsed;
    }
    return parsed.rect;
  }
  return getElementRect(driver, elementUUID);
}

export function aiDisabledResult(): ContentResult {
  return errorResult(AI_DISABLED_REJECTION);
}
