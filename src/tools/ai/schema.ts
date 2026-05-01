import { z } from 'zod';

export const AI_ACTIONS = ['find_element'] as const;
export type AIAction = (typeof AI_ACTIONS)[number];

export const aiSchema = z.object({
  action: z
    .enum(AI_ACTIONS)
    .describe(
      `AI capability to invoke. ` +
        `find_element: locate an element from a natural-language description using a vision model. ` +
        `Returns a coordinate UUID (format: ai-element:x,y:bbox) usable with appium_gesture (tap/double_tap/long_press).`
    ),

  instruction: z
    .string()
    .optional()
    .describe(
      `Natural-language description of the target element. ` +
        `Required for: find_element. ` +
        `Examples: "yellow search button at bottom", "username input field at top", "settings icon in top-right corner".`
    ),

  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export type AIArgs = z.infer<typeof aiSchema>;
