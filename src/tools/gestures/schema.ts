import {z} from 'zod';

import {elementUUIDScheme} from '../../schema.js';
import {isAIEnabled} from '../ai/config.js';

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
      [
        'Gesture to perform:',
        '- tap: tap an element or a coordinate.',
        '- double_tap: double-tap, for example to zoom an image or favorite a post.',
        '- long_press: press and hold to open a context menu or initiate a drag.',
        'For tap/double_tap/long_press, provide elementUUID or both x and y.',
        '- scroll: browse a list, feed, or page to reveal content.',
        '- swipe: dismiss a card, switch screens or tabs, navigate a carousel, or pull-to-refresh (use speed=fast).',
        'For scroll/swipe, provide direction or all four custom coordinates: x, y, endX, endY.',
        '- pinch_zoom: zoom in (scale > 1) or out (scale < 1) on maps, images, or other zoomable views. Requires scale.',
        '- scroll_to_element: scroll to find a target using strategy and selector. Direction is up/down, default down.',
        'Stops when the element is found, page source is unchanged after a scroll (likely end of content), or maxScrollAttempts is reached.',
        'Adjust distance with scrollDistance (0.05–1) or scrollDistancePreset (small/medium/large).',
        '- back: trigger system back navigation.',
      ].join('\n'),
    ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      AI_UUID_HINT +
        'Element UUID for tap, double_tap, long_press, or pinch_zoom; overrides x/y for these actions. ' +
        'For scroll/swipe with direction, coordinates are calculated relative to this element instead of the whole screen.',
    ),

  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'X coordinate in pixels. For tap/double_tap/long_press: tap location, paired with y. ' +
        'For scroll/swipe: starting X in custom-coordinate mode; requires y, endX, endY. ' +
        'For pinch_zoom: center X, paired with y. Tap/double_tap/long_press/pinch_zoom ignore x/y when elementUUID is set.',
    ),
  y: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Y coordinate in pixels, paired with x. For tap/double_tap/long_press: tap location. ' +
        'For scroll/swipe: starting Y in custom-coordinate mode. For pinch_zoom: center Y. ' +
        'The same elementUUID precedence as x applies.',
    ),
  endX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Ending X coordinate in pixels for scroll/swipe; requires x, y, endY.'),
  endY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Ending Y coordinate in pixels for scroll/swipe; requires x, y, endX.'),

  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      'Direction for scroll/swipe. Coordinates are calculated from the screen or element bounds. ' +
        'Provide either direction or custom coordinates (x, y, endX, endY); direction takes precedence if both are given. ' +
        'For scroll_to_element, use up/down; default down.',
    ),

  speed: z
    .enum(SWIPE_SPEEDS)
    .optional()
    .describe(
      'Swipe only. slow: deliberate drag; normal: default navigation speed; fast: flick without an initial hold. ' +
        'Use fast for pull-to-refresh and other velocity-sensitive interfaces.',
    ),

  duration: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      'Duration in milliseconds. long_press defaults to 2000 (range 500–10000); scroll defaults to 800. ' +
        'For swipe, prefer speed unless a custom movement duration is needed. ' +
        'For W3C swipe, overrides movement time; speed still sets the initial hold. ' +
        'Ignored by iOS native mobile: swipe (direction, no elementUUID, speed != fast).',
    ),

  scale: z
    .number()
    .min(0.01)
    .max(10)
    .optional()
    .describe(
      'Required for pinch_zoom. Scale < 1 zooms out (fingers close); scale > 1 zooms in (fingers spread). ' +
        'Examples: 0.5 zooms out; 2.0 zooms in 2x.',
    ),
  velocity: z
    .number()
    .min(0.1)
    .max(20)
    .optional()
    .describe('Pinch velocity in scale factor per second. Default 2.2. Used by pinch_zoom.'),

  strategy: z
    .enum(LOCATOR_STRATEGIES)
    .optional()
    .describe(
      'Required for scroll_to_element. Prefer accessibility id > id > platform-native ' +
        '(iOS: -ios predicate string / -ios class chain; Android: -android uiautomator) > xpath (last resort: slow/brittle). ' +
        'name is legacy; class name may match multiple elements; css selector is webview-only. ' +
        'Same priorities as appium_find_element.',
    ),
  selector: z.string().optional().describe(`Locator selector value. Required for: scroll_to_element.`),

  maxScrollAttempts: z
    .number()
    .int()
    .min(1)
    .max(80)
    .optional()
    .default(10)
    .describe('scroll_to_element only: maximum scroll attempts after the initial lookup fails. Default 10.'),

  scrollDistance: z
    .number()
    .min(0.05)
    .max(1)
    .optional()
    .describe(
      'scroll_to_element only: vertical swipe distance fraction (0.05–1). ' +
        'Ignored when scrollDistancePreset is set. Default 0.45 when neither option is supplied.',
    ),

  scrollDistancePreset: z
    .enum(SCROLL_DISTANCE_PRESETS)
    .optional()
    .describe(
      'scroll_to_element only: small is a light nudge (0.25), medium is 0.45, large is the full default swipe (1). ' +
        'Overrides scrollDistance when set.',
    ),

  sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
});

export type GestureArgs = z.infer<typeof gestureSchema>;
