import type { ContentResult, FastMCP } from 'fastmcp';
import type { DriverInstance } from '../../session-store.js';
import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';
import { getWindowRect, performActions } from '../../command.js';
import { isAIEnabled } from '../ai/config.js';
import {
  errorResult,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';
import {
  aiDisabledResult,
  isAiElementUUID,
  resolveTargetRect,
} from './handlers/ai-element.js';

const DROP_PAUSE_DURATION_MS = 150;

const AI_UUID_HINT = isAIEnabled()
  ? `Supports AI coordinate UUIDs (format: ai-element:x,y:bbox) returned by appium_ai. `
  : '';

const dragAndDropSchema = z.object({
  sourceElementUUID: elementUUIDScheme
    .optional()
    .describe(
      AI_UUID_HINT +
        `UUID of source element to drag from. Either sourceElementUUID or sourceX+sourceY must be provided.`
    ),
  sourceX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Source X coordinate. Required if sourceElementUUID is not provided.'
    ),
  sourceY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Source Y coordinate. Required if sourceElementUUID is not provided.'
    ),
  targetElementUUID: elementUUIDScheme
    .optional()
    .describe(
      AI_UUID_HINT +
        `UUID of target element to drop on. Either targetElementUUID or targetX+targetY must be provided.`
    ),
  targetX: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Target X coordinate. Required if targetElementUUID is not provided.'
    ),
  targetY: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Target Y coordinate. Required if targetElementUUID is not provided.'
    ),
  duration: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .optional()
    .describe('Duration of the drag movement in milliseconds. Default 1200.'),
  longPressDuration: z
    .number()
    .int()
    .min(400)
    .max(2000)
    .optional()
    .describe(
      'Duration of the long press before dragging in milliseconds. Default 600.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

type DragArgs = z.infer<typeof dragAndDropSchema>;

export default function dragAndDrop(server: FastMCP): void {
  server.addTool({
    name: 'appium_drag_and_drop',
    description:
      'Perform a drag-and-drop gesture from a source location to a target location. ' +
      'The gesture: long press the source (default 600ms), drag to the target (default 1200ms), then release. ' +
      'Source and target can each be specified as either an element UUID or coordinates. ' +
      'Useful for reordering lists, moving items, drag-to-delete.',
    parameters: dragAndDropSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: DragArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      if (
        (args.sourceElementUUID &&
          isAiElementUUID(args.sourceElementUUID) &&
          !isAIEnabled()) ||
        (args.targetElementUUID &&
          isAiElementUUID(args.targetElementUUID) &&
          !isAIEnabled())
      ) {
        return aiDisabledResult();
      }

      try {
        const source = await resolvePoint(
          driver,
          args.sourceElementUUID,
          args.sourceX,
          args.sourceY,
          'source'
        );
        if ('error' in source) {
          return errorResult(source.error);
        }
        const target = await resolvePoint(
          driver,
          args.targetElementUUID,
          args.targetX,
          args.targetY,
          'target'
        );
        if ('error' in target) {
          return errorResult(target.error);
        }

        const { width, height } = await getWindowRect(driver);
        if (
          source.x < 0 ||
          source.x >= width ||
          source.y < 0 ||
          source.y >= height
        ) {
          return errorResult(
            `Source coordinates (${source.x}, ${source.y}) are out of screen bounds (${width}x${height}).`
          );
        }
        if (
          target.x < 0 ||
          target.x >= width ||
          target.y < 0 ||
          target.y >= height
        ) {
          return errorResult(
            `Target coordinates (${target.x}, ${target.y}) are out of screen bounds (${width}x${height}).`
          );
        }

        const duration = args.duration ?? 1200;
        const longPressDuration = args.longPressDuration ?? 600;

        await performActions(driver, [
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              { type: 'pointerMove', duration: 0, x: source.x, y: source.y },
              { type: 'pointerDown', button: 0 },
              { type: 'pause', duration: longPressDuration },
              { type: 'pointerMove', duration, x: target.x, y: target.y },
              { type: 'pause', duration: DROP_PAUSE_DURATION_MS },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ]);

        const sourceDesc = args.sourceElementUUID
          ? `element ${args.sourceElementUUID}`
          : `(${source.x}, ${source.y})`;
        const targetDesc = args.targetElementUUID
          ? `element ${args.targetElementUUID}`
          : `(${target.x}, ${target.y})`;
        return textResult(
          `Successfully dragged from ${sourceDesc} to ${targetDesc}.`
        );
      } catch (err) {
        return errorResult(
          `Failed to perform drag_and_drop. ${toolErrorMessage(err)}`
        );
      }
    },
  });
}

async function resolvePoint(
  driver: DriverInstance,
  uuid: string | undefined,
  x: number | undefined,
  y: number | undefined,
  role: 'source' | 'target'
): Promise<{ x: number; y: number } | { error: string }> {
  if (uuid) {
    // ai-element UUIDs are coordinates, not real element ids — resolve via
    // the shared helper (bbox centre for AI, getElementRect for real elements).
    const rect = await resolveTargetRect(driver, uuid);
    if ('error' in rect) {
      return rect;
    }
    return {
      x: Math.floor(rect.x + rect.width / 2),
      y: Math.floor(rect.y + rect.height / 2),
    };
  }
  if (x === undefined || y === undefined) {
    return {
      error:
        role === 'source'
          ? 'drag_and_drop requires either sourceElementUUID, or both sourceX and sourceY.'
          : 'drag_and_drop requires either targetElementUUID, or both targetX and targetY.',
    };
  }
  return { x, y };
}
