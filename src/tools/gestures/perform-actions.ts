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
    .describe('Milliseconds; required for pause/pointerMove.'),
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
    .describe('Origin: viewport (default) or pointer-relative.'),
});

const inputSourceSchema = z.object({
  type: z
    .enum(['pointer', 'key', 'none'])
    .describe('Source: pointer, key, or none (timing).'),
  id: z.string().describe('Unique source ID, e.g. finger1.'),
  parameters: z
    .object({
      pointerType: z
        .enum(['touch', 'mouse', 'pen'])
        .optional()
        .describe('Pointer source kind; use touch for mobile.'),
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
      'W3C input sources. Multiple sources run in parallel, synchronized by action index.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export default function performActionsTool(server: FastMCP): void {
  server.addTool({
    name: 'appium_perform_actions',
    description:
      'Raw W3C Actions for precise/custom multi-touch. Prefer appium_gesture for standard gestures.',
    parameters: performActionsSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof performActionsSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
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
