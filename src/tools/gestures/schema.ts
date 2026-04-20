import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';

export const GESTURE_ACTIONS = [
  'tap',
  'double_tap',
  'long_press',
  'scroll',
  'swipe',
  'flick',
  'pinch_zoom',
  'scroll_to_element',
] as const;

export type GestureAction = (typeof GESTURE_ACTIONS)[number];

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
  action: z.enum(GESTURE_ACTIONS).describe(
    `Gesture to perform. ` +
      `tap: single tap on an element (elementUUID) or coordinates (x, y). ` +
      `double_tap: double tap on an element or coordinates. ` +
      `long_press: press and hold on an element or coordinates (use duration). ` +
      `scroll: slow content-aware drag (default 800ms) — respects scroll views on iOS. Use for browsing lists, feeds, pages. Supports direction or custom coordinates. ` +
      `swipe: fast directional gesture (default 300ms) — raw touch. Use for dismissing sheets, switching screens, carousels. Supports direction or custom coordinates. ` +
      `flick: very fast swipe with no hold (default 100ms). Use for pull-to-refresh and velocity-sensitive UIs. Supports direction or custom coordinates. ` +
      `pinch_zoom: two-finger pinch to zoom in (scale > 1) or out (scale < 1) on an element or screen. ` +
      `scroll_to_element: repeatedly scroll until an element matching strategy + selector becomes visible.`
  ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      `UUID of the element to act on. Supports AI coordinate UUIDs (format: ai-element:x,y:bbox). ` +
        `Used by: tap, double_tap, long_press, pinch_zoom. ` +
        `For scroll/swipe/flick, when provided with direction, the gesture is calculated relative to this element instead of the whole screen.`
    ),

  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `X coordinate. ` +
        `For tap/double_tap/long_press: tap location (alternative to elementUUID). ` +
        `For scroll/swipe/flick: starting X for custom-coordinate mode (requires y, endX, endY).`
    ),
  y: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Y coordinate. ` +
        `For tap/double_tap/long_press: tap location. ` +
        `For scroll/swipe/flick: starting Y for custom-coordinate mode.`
    ),
  endX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`Ending X coordinate. Used by: scroll, swipe, flick (custom-coordinate mode).`),
  endY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`Ending Y coordinate. Used by: scroll, swipe, flick (custom-coordinate mode).`),

  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      `Direction for scroll, swipe, or flick. Coordinates are auto-calculated from screen or element bounds. ` +
        `Either direction OR custom coordinates (x, y, endX, endY) must be provided for these actions.`
    ),

  duration: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      `Duration in milliseconds. ` +
        `long_press default 2000 (range 500-10000). scroll default 800. swipe default 300. flick default 100.`
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
    .describe(`Pinch velocity in scale factor per second. Default 2.2. Used by: pinch_zoom.`),

  strategy: z
    .enum(LOCATOR_STRATEGIES)
    .optional()
    .describe(`Locator strategy. Required for: scroll_to_element.`),
  selector: z
    .string()
    .optional()
    .describe(`Locator selector value. Required for: scroll_to_element.`),

  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export type GestureArgs = z.infer<typeof gestureSchema>;
