import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';

export const GESTURE_ACTIONS = [
  'tap',
  'double_tap',
  'long_press',
  'scroll',
  'swipe',
  'pinch_zoom',
  'scroll_to_element',
] as const;

export type GestureAction = (typeof GESTURE_ACTIONS)[number];

export const SWIPE_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type SwipeSpeed = (typeof SWIPE_SPEEDS)[number];

export const SCROLL_DISTANCE_PRESETS = ['small', 'medium', 'large'] as const;
export type ScrollDistancePreset = (typeof SCROLL_DISTANCE_PRESETS)[number];

export const LOCATOR_STRATEGIES = [
  'xpath',
  'id',
  'name',
  'class name',
  'accessibility id',
  'css selector',
  '-android uiautomator',
  '-ios predicate string',
  '-ios class chain',
] as const;

export const gestureSchema = z.object({
  action: z
    .enum(GESTURE_ACTIONS)
    .describe(
      `Gesture to perform. ` +
        `tap: tap an element or a coordinate. ` +
        `double_tap: trigger a double-tap action (e.g. zoom in on an image, favorite a post). ` +
        `long_press: press and hold to open a context menu or initiate drag. ` +
        `scroll: browse a list, feed, or page to reveal content. ` +
        `swipe: dismiss a card, switch screens or tabs, navigate a carousel, or pull-to-refresh (use speed=fast). ` +
        `pinch_zoom: zoom in (scale > 1) or out (scale < 1) on maps, images, or any zoomable view. ` +
        `scroll_to_element: scroll until a specific element is on screen (strategy + selector + direction up|down). ` +
        `Stops when the element is found, page source is unchanged after a scroll (end of scrollable content), or maxScrollAttempts is reached. ` +
        `Optional scrollDistance (0.05–1) or scrollDistancePreset (small|medium|large).`
    ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      `UUID of the element to act on. Supports AI coordinate UUIDs (format: ai-element:x,y:bbox). ` +
        `Used by: tap, double_tap, long_press, pinch_zoom. ` +
        `For scroll/swipe, when provided with direction, the gesture is calculated relative to this element instead of the whole screen.`
    ),

  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `X coordinate. ` +
        `For tap/double_tap/long_press: tap location (alternative to elementUUID). ` +
        `For scroll/swipe: starting X for custom-coordinate mode (requires y, endX, endY).`
    ),
  y: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Y coordinate. ` +
        `For tap/double_tap/long_press: tap location. ` +
        `For scroll/swipe: starting Y for custom-coordinate mode.`
    ),
  endX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Ending X coordinate. Used by: scroll, swipe (custom-coordinate mode).`
    ),
  endY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Ending Y coordinate. Used by: scroll, swipe (custom-coordinate mode).`
    ),

  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      `Direction for scroll or swipe. Coordinates are auto-calculated from screen or element bounds. ` +
        `Either direction OR custom coordinates (x, y, endX, endY) must be provided for these actions.`
    ),

  speed: z
    .enum(SWIPE_SPEEDS)
    .optional()
    .describe(
      `Swipe speed. slow = deliberate drag; normal = default navigation speed; fast = flick with no hold, use for pull-to-refresh and other velocity-sensitive UIs. Used by: swipe.`
    ),

  duration: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      `Duration in milliseconds. long_press default 2000 (range 500-10000). scroll default 800. ` +
        `For swipe, prefer the speed parameter; duration overrides it if both are provided.`
    ),

  scale: z
    .number()
    .min(0.01)
    .max(10)
    .optional()
    .describe(
      `Pinch scale factor. < 1 = zoom out (pinch close), > 1 = zoom in (pinch open). Example: 0.5 = zoom out 50%, 2.0 = zoom in 2x. Required for: pinch_zoom.`
    ),
  velocity: z
    .number()
    .min(0.1)
    .max(20)
    .optional()
    .describe(
      `Pinch velocity in scale factor per second. Default 2.2. Used by: pinch_zoom.`
    ),

  strategy: z
    .enum(LOCATOR_STRATEGIES)
    .optional()
    .describe(`Locator strategy. Required for: scroll_to_element.`),
  selector: z
    .string()
    .optional()
    .describe(`Locator selector value. Required for: scroll_to_element.`),

  maxScrollAttempts: z
    .number()
    .int()
    .min(1)
    .max(80)
    .optional()
    .default(10)
    .describe(
      `scroll_to_element only: maximum scroll attempts after the element is not yet visible (default 10).`
    ),

  scrollDistance: z
    .number()
    .min(0.05)
    .max(1)
    .optional()
    .describe(
      `scroll_to_element only: vertical swipe length as a fraction 0.05–1 (same scale as legacy scroll). ` +
        `Ignored when scrollDistancePreset is set. Default 0.45 if neither preset nor scrollDistance is set.`
    ),

  scrollDistancePreset: z
    .enum(SCROLL_DISTANCE_PRESETS)
    .optional()
    .describe(
      `scroll_to_element only: convenience preset — small ≈ light nudge (0.25), medium ≈ 0.45, large = full default swipe (1). ` +
        `When set, overrides scrollDistance.`
    ),

  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export type GestureArgs = z.infer<typeof gestureSchema>;
