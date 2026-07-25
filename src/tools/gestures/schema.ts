import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';
import { isAIEnabled } from '../ai/config.js';

const AI_UUID_HINT = isAIEnabled()
  ? `Supports AI coordinate UUIDs (format: ai-element:x,y:bbox) returned by appium_ai. `
  : '';

export const GESTURE_ACTIONS = [
  'tap',
  'double_tap',
  'long_press',
  'scroll',
  'swipe',
  'pinch_zoom',
  'scroll_to_element',
  'back',
] as const;

export type GestureAction = (typeof GESTURE_ACTIONS)[number];

export const SWIPE_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type SwipeSpeed = (typeof SWIPE_SPEEDS)[number];

export const SCROLL_DISTANCE_PRESETS = ['small', 'medium', 'large'] as const;
export type ScrollDistancePreset = (typeof SCROLL_DISTANCE_PRESETS)[number];

export const LOCATOR_STRATEGIES = [
  'accessibility id',
  'id',
  '-ios predicate string',
  '-ios class chain',
  '-android uiautomator',
  'xpath',
  'name',
  'class name',
  'css selector',
] as const;

export const gestureSchema = z.object({
  action: z
    .enum(GESTURE_ACTIONS)
    .describe(
      'Gesture to perform. ' +
        'tap: tap an element or a coordinate. ' +
        'double_tap: trigger a double-tap action (e.g. zoom in on an image, favorite a post). ' +
        'long_press: press and hold to open a context menu or initiate drag. ' +
        'scroll: browse a list, feed, or page to reveal content. ' +
        'swipe: dismiss a card, switch screens or tabs, navigate a carousel, or pull-to-refresh (use speed=fast). ' +
        'pinch_zoom: zoom in (scale > 1) or out (scale < 1) on maps, images, or any zoomable view. ' +
        'scroll_to_element: scroll until a specific element is on screen (strategy + selector + direction up|down). ' +
        'Stops when the element is found, page source is unchanged after a scroll (end of scrollable content), or maxScrollAttempts is reached. ' +
        'Optional scrollDistance (0.05–1) or scrollDistancePreset (small|medium|large). ' +
        'back: triggers the system back navigation (e.g., Android back button or iOS navigation controller pop).'
    ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      'UUID of the element to act on. ' +
        AI_UUID_HINT +
        'Used by: tap, double_tap, long_press, pinch_zoom. ' +
        'For scroll/swipe, when provided with direction, the gesture is calculated relative to this element instead of the whole screen.'
    ),

  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Tap/start/pinch-center X. Custom scroll/swipe also requires y, endX, endY.'
    ),
  y: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Tap/start/pinch-center Y. Custom scroll/swipe also requires x, endX, endY.'
    ),
  endX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('End X for custom scroll/swipe.'),
  endY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('End Y for custom scroll/swipe.'),

  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      'scroll/swipe direction; alternative to coordinates. scroll_to_element uses up/down, default down.'
    ),

  speed: z
    .enum(SWIPE_SPEEDS)
    .optional()
    .describe(
      'swipe speed; fast is a flick for pull-to-refresh or velocity-sensitive UI.'
    ),

  duration: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      'Milliseconds. long_press default 2000; scroll default 800; overrides swipe speed.'
    ),

  scale: z
    .number()
    .min(0.01)
    .max(10)
    .optional()
    .describe(
      'pinch_zoom scale: below 1 zooms out, above 1 zooms in. Required.'
    ),
  velocity: z
    .number()
    .min(0.1)
    .max(20)
    .optional()
    .describe('pinch_zoom scale/second; default 2.2.'),

  strategy: z
    .enum(LOCATOR_STRATEGIES)
    .optional()
    .describe(
      'scroll_to_element locator. Prefer accessibility id/id, then platform-native; xpath last.'
    ),
  selector: z
    .string()
    .optional()
    .describe('scroll_to_element selector. Required.'),

  maxScrollAttempts: z
    .number()
    .int()
    .min(1)
    .max(80)
    .optional()
    .default(10)
    .describe('scroll_to_element attempt limit; default 10.'),

  scrollDistance: z
    .number()
    .min(0.05)
    .max(1)
    .optional()
    .describe(
      'scroll_to_element distance 0.05–1; default 0.45; preset overrides.'
    ),

  scrollDistancePreset: z
    .enum(SCROLL_DISTANCE_PRESETS)
    .optional()
    .describe(
      'scroll_to_element preset: small=.25, medium=.45, large=1; overrides distance.'
    ),

  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export type GestureArgs = z.infer<typeof gestureSchema>;
