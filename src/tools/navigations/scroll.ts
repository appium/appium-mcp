import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import log from '../../logger.js';
import { execute, getWindowRect, performActions } from '../../command.js';
import type { DriverInstance } from '../../session-store.js';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

function verticalScrollYs(
  height: number,
  direction: 'up' | 'down',
  distance: number
): { startY: number; endY: number } {
  const mid = height * 0.5;
  const halfSpan = height * 0.3 * distance;
  if (direction === 'down') {
    return {
      startY: Math.floor(mid + halfSpan),
      endY: Math.floor(mid - halfSpan),
    };
  }
  return {
    startY: Math.floor(mid - halfSpan),
    endY: Math.floor(mid + halfSpan),
  };
}

export type VerticalScrollOptions = {
  direction: 'up' | 'down';
  distance: number;
};

/** Same vertical swipe as `appium_scroll` (exported for `appium_find_element` scroll-until-found). */
export async function performVerticalScroll(
  driver: DriverInstance,
  options: VerticalScrollOptions
): Promise<void> {
  const rect = await getWindowRect(driver);
  const { width, height } = rect;
  const startX = Math.floor(width / 2);
  const { startY, endY } = verticalScrollYs(
    height,
    options.direction,
    options.distance
  );

  if (getPlatformName(driver) === PLATFORM.android) {
    const operation = [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y: startY },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 250 },
          { type: 'pointerMove', duration: 600, x: startX, y: endY },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ];
    await performActions(driver, operation);
  } else if (getPlatformName(driver) === PLATFORM.ios) {
    await execute(driver, 'mobile: scroll', {
      direction: options.direction,
      startX,
      startY,
      endX: startX,
      endY,
    });
  } else {
    throw new Error(
      `Unsupported platform: ${getPlatformName(driver)}. Only Android and iOS are supported.`
    );
  }
}

const scrollSchema = z.object({
  direction: z
    .enum(['up', 'down'])
    .default('down')
    .describe('Scroll direction'),
  distance: z
    .number()
    .min(0.05)
    .max(1)
    .default(1)
    .describe(
      'How much of the default full swipe to perform (0.05–1). 1 = full swipe (legacy behavior: ~60% of screen height). Use smaller values (e.g. 0.3–0.5) for a small nudge; use 1 for a full page scroll.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function scroll(server: FastMCP): void {
  server.addTool({
    name: 'appium_scroll',
    description: `Scrolls the current screen up or down. Uses a vertical swipe in the middle of the screen. Use optional parameter distance to control swipe length: 1 for a full default swipe, or a smaller fraction (e.g. 0.35) for a lighter scroll.`,
    parameters: scrollSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof scrollSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const rect = await getWindowRect(driver);
        log.info('Device screen size:', {
          width: rect.width,
          height: rect.height,
        });
        log.info('Scroll:', {
          direction: args.direction,
          distance: args.distance,
        });
        await performVerticalScroll(driver, {
          direction: args.direction,
          distance: args.distance,
        });
        log.info('Scroll action completed successfully.');
        return textResult(
          `Scrolled ${args.direction} successfully (distance=${args.distance}).`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to scroll ${args.direction}. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
