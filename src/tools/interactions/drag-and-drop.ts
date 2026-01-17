import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
} from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';

const DROP_PAUSE_DURATION_MS = 150;

async function performDragAndDrop(
  driver: any,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number,
  longPressDuration: number
): Promise<void> {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: longPressDuration },
        { type: 'pointerMove', duration, x: endX, y: endY },
        { type: 'pause', duration: DROP_PAUSE_DURATION_MS },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
}

export default function dragAndDrop(server: FastMCP): void {
  const dragAndDropSchema = z.object({
    sourceElementUUID: elementUUIDScheme
      .trim()
      .min(1)
      .optional()
      .describe(
        'UUID of the source element to drag from. Either sourceElementUUID or sourceX/sourceY must be provided.'
      ),
    sourceX: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Starting X coordinate. Required if sourceElementUUID is not provided.'
      ),
    sourceY: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Starting Y coordinate. Required if sourceElementUUID is not provided.'
      ),
    targetElementUUID: elementUUIDScheme
      .trim()
      .min(1)
      .optional()
      .describe(
        'UUID of the target element to drop on. Either targetElementUUID or targetX/targetY must be provided.'
      ),
    targetX: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Ending X coordinate. Required if targetElementUUID is not provided.'
      ),
    targetY: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Ending Y coordinate. Required if targetElementUUID is not provided.'
      ),
    duration: z
      .number()
      .int()
      .min(100)
      .max(5000)
      .default(1200)
      .optional()
      .describe(
        'Duration of the drag movement in milliseconds. Default is 1200ms.'
      ),
    longPressDuration: z
      .number()
      .int()
      .min(400)
      .max(2000)
      .default(600)
      .optional()
      .describe(
        'Duration of the long press before dragging in milliseconds. Default is 600ms.'
      ),
  });

  server.addTool({
    name: 'appium_drag_and_drop',
    description: `Perform a drag and drop gesture from a source location to a target location.
      The gesture includes:
      1. Long press (default 600ms, configurable) on the source to initiate drag mode
      2. While holding, drag to the target location
      3. Release at the target to complete the drop

      Supports four modes:
      1. Element to Element: Drag from one element to another element
      2. Element to Coordinates: Drag from an element to specific coordinates
      3. Coordinates to Element: Drag from coordinates to an element
      4. Coordinates to Coordinates: Drag from coordinates to coordinates

      This is useful for reordering lists, moving items, drag-to-delete, and other drag interactions.`,
    parameters: dragAndDropSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        const duration = args.duration || 1200;
        const longPressDuration = args.longPressDuration || 600;

        if (
          !args.sourceElementUUID &&
          (args.sourceX === undefined || args.sourceY === undefined)
        ) {
          throw new Error(
            'Either sourceElementUUID or both sourceX and sourceY must be provided.'
          );
        }

        if (
          !args.targetElementUUID &&
          (args.targetX === undefined || args.targetY === undefined)
        ) {
          throw new Error(
            'Either targetElementUUID or both targetX and targetY must be provided.'
          );
        }

        let startX: number, startY: number;
        let endX: number, endY: number;

        if (args.sourceElementUUID) {
          const rect = await (driver as any).getElementRect(
            args.sourceElementUUID
          );
          startX = Math.floor(rect.x + rect.width / 2);
          startY = Math.floor(rect.y + rect.height / 2);
        } else {
          startX = args.sourceX;
          startY = args.sourceY;
        }

        if (args.targetElementUUID) {
          const rect = await (driver as any).getElementRect(
            args.targetElementUUID
          );
          endX = Math.floor(rect.x + rect.width / 2);
          endY = Math.floor(rect.y + rect.height / 2);
        } else {
          endX = args.targetX;
          endY = args.targetY;
        }

        const { width, height } = await (driver as any).getWindowRect();
        if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
          throw new Error(
            `Source coordinates (${startX}, ${startY}) are out of screen bounds (${width}x${height})`
          );
        }
        if (endX < 0 || endX >= width || endY < 0 || endY >= height) {
          throw new Error(
            `Target coordinates (${endX}, ${endY}) are out of screen bounds (${width}x${height})`
          );
        }

        if (platform === 'Android' || platform === 'iOS') {
          await performDragAndDrop(
            driver,
            startX,
            startY,
            endX,
            endY,
            duration,
            longPressDuration
          );
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        const sourceDesc = args.sourceElementUUID
          ? `element ${args.sourceElementUUID}`
          : `coordinates (${startX}, ${startY})`;
        const targetDesc = args.targetElementUUID
          ? `element ${args.targetElementUUID}`
          : `coordinates (${endX}, ${endY})`;

        return {
          content: [
            {
              type: 'text',
              text: `Successfully performed drag and drop from ${sourceDesc} to ${targetDesc}.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform drag and drop. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
