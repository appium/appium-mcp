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
      'Gesture action. scroll browses content; swipe navigates or dismisses. ' +
        'scroll_to_element requires strategy + selector and stops on match, unchanged page, or maxScrollAttempts.'
    ),

  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      AI_UUID_HINT +
        'Target for tap/double_tap/long_press/pinch_zoom; scopes directional scroll/swipe when set.'
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
