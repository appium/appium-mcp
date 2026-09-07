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
      'tap/double_tap/long_press: target elementUUID or x+y. pinch_zoom: requires scale. ' +
        'scroll/swipe: use direction or x+y+endX+endY. ' +
        'scroll_to_element: requires strategy+selector; stops on a match, unchanged page source, or maxScrollAttempts. ' +
        'back: system back navigation.',
    ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      AI_UUID_HINT +
        'Target for tap/double_tap/long_press/pinch_zoom. With direction, bounds scroll/swipe to this element.',
    ),

  x: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'X pixel coordinate (requires y): tap location, scroll/swipe start, or pinch center. Tap/pinch prefer elementUUID.',
    ),
  y: z.number().int().min(0).optional().describe('Y pixel coordinate paired with x. Tap/pinch prefer elementUUID.'),
  endX: z.number().int().min(0).optional().describe('Scroll/swipe endpoint X; requires x, y, endY.'),
  endY: z.number().int().min(0).optional().describe('Scroll/swipe endpoint Y; requires x, y, endX.'),

  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      'Scroll/swipe direction from screen or element bounds; alternative to custom coordinates. scroll_to_element: up/down (default down).',
    ),

  speed: z
    .enum(SWIPE_SPEEDS)
    .optional()
    .describe('Swipe only: slow=drag, normal=default, fast=flick without hold (pull-to-refresh).'),

  duration: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe('Milliseconds: long_press default 2000 (500-10000); scroll default 800; swipe overrides speed timing.'),

  scale: z
    .number()
    .min(0.01)
    .max(10)
    .optional()
    .describe('Required for pinch_zoom: <1 zooms out, >1 zooms in (e.g. 2 doubles size).'),
  velocity: z.number().min(0.1).max(20).optional().describe('pinch_zoom scale factor per second; default 2.2.'),

  strategy: z
    .enum(LOCATOR_STRATEGIES)
    .optional()
    .describe(
      'Required for scroll_to_element. Follow appium_find_element priorities: accessibility id > id > platform-native > xpath (last resort); css selector is webview-only.',
    ),
  selector: z.string().optional().describe(`Locator selector value. Required for: scroll_to_element.`),

  maxScrollAttempts: z
    .number()
    .int()
    .min(1)
    .max(80)
    .optional()
    .default(10)
    .describe('scroll_to_element: maximum scroll attempts; default 10.'),

  scrollDistance: z
    .number()
    .min(0.05)
    .max(1)
    .optional()
    .describe(
      'scroll_to_element: swipe distance fraction (0.05–1), default 0.45. scrollDistancePreset overrides this.',
    ),

  scrollDistancePreset: z
    .enum(SCROLL_DISTANCE_PRESETS)
    .optional()
    .describe('scroll_to_element: small=0.25, medium=0.45, large=1; overrides scrollDistance.'),

  sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
});

export type GestureArgs = z.infer<typeof gestureSchema>;
