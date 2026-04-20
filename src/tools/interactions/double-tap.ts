import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { execute, getElementRect, performActions } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export default function doubleTap(server: FastMCP): void {
  const doubleTapActionSchema = z.object({
    elementUUID: elementUUIDScheme,
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_double_tap',
    description: 'Perform double tap on an element',
    parameters: doubleTapActionSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof doubleTapActionSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const platform = getPlatformName(driver);
        if (platform === PLATFORM.android) {
          // Get element location for Android double tap
          const elementRect = await getElementRect(driver, args.elementUUID);

          // Calculate center coordinates
          const x = elementRect.x + elementRect.width / 2;
          const y = elementRect.y + elementRect.height / 2;

          // Perform double tap using performActions
          const operation = [
            {
              type: 'pointer',
              id: 'finger1',
              parameters: { pointerType: 'touch' },
              actions: [
                { type: 'pointerMove', duration: 0, x, y },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 50 },
                { type: 'pointerUp', button: 0 },
                { type: 'pause', duration: 100 },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 50 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ];
          await performActions(driver, operation);
        } else if (platform === PLATFORM.ios) {
          // Use iOS mobile: doubleTap execute method
          await execute(driver, 'mobile: doubleTap', {
            elementId: args.elementUUID,
          });
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return textResult(
          `Successfully performed double tap on element ${args.elementUUID}`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to perform double tap on element ${args.elementUUID}. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
