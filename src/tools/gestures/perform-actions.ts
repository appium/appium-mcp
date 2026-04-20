import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { performActions } from '../../command.js';
import {
  errorResult,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';

const actionStepSchema = z.object({
  type: z
    .enum([
      'pointerMove',
      'pointerDown',
      'pointerUp',
      'pointerCancel',
      'keyDown',
      'keyUp',
      'pause',
    ])
    .describe('Action step type.'),
  duration: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Duration in milliseconds. Required for pause and pointerMove.'),
  x: z.number().int().optional().describe('X coordinate (pointerMove only).'),
  y: z.number().int().optional().describe('Y coordinate (pointerMove only).'),
  button: z
    .number()
    .int()
    .optional()
    .describe('Button index (pointerDown/pointerUp). 0 = primary.'),
  value: z.string().optional().describe('Key value (keyDown/keyUp only).'),
  origin: z
    .string()
    .optional()
    .describe(
      'Coordinate origin: "viewport" (default) or "pointer" (relative to current position).'
    ),
});

const inputSourceSchema = z.object({
  type: z
    .enum(['pointer', 'key', 'none'])
    .describe(
      'Input source type. pointer = touch/mouse, key = keyboard, none = pause/timing.'
    ),
  id: z
    .string()
    .describe(
      'Unique identifier for this input source (e.g. "finger1", "finger2").'
    ),
  parameters: z
    .object({
      pointerType: z
        .enum(['touch', 'mouse', 'pen'])
        .optional()
        .describe(
          'Pointer type. Use "touch" for mobile gestures. Only for type=pointer.'
        ),
    })
    .optional(),
  actions: z
    .array(actionStepSchema)
    .describe('Ordered list of action steps for this input source.'),
});

const performActionsSchema = z.object({
  actions: z
    .array(inputSourceSchema)
    .min(1)
    .describe(
      `W3C Actions API input source array. Each entry is one input source (pointer/key/none) with its action sequence. ` +
        `Multiple pointer sources enable multi-touch gestures (e.g. two-finger rotate, three-finger swipe). ` +
        `All sources execute in parallel, synchronized tick-by-tick.`
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function performActionsTool(server: FastMCP): void {
  server.addTool({
    name: 'appium_perform_actions',
    description:
      `Execute raw W3C Actions API sequences for advanced multi-touch gestures not covered by appium_gesture. ` +
      `Use this for custom multi-finger gestures (rotate, three-finger swipe, edge swipes), complex timing sequences, ` +
      `or any gesture requiring precise control over individual touch points. ` +
      `Prefer appium_gesture for standard gestures (tap, scroll, swipe, pinch) — it handles platform differences automatically.`,
    parameters: performActionsSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof performActionsSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        await performActions(driver, args.actions);
        return textResult(
          `Successfully performed ${args.actions.length} input source(s).`
        );
      } catch (err) {
        return errorResult(
          `Failed to perform actions. ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
