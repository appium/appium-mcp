import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export function lockDevice(server: FastMCP): void {
  const lockSchema = z.object({
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
    seconds: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'How long to lock the screen in seconds before it is automatically unlocked. Supported on both Android (UiAutomator2) and iOS (XCUITest). If omitted, the device stays locked until appium_mobile_unlock is called.'
      ),
  });

  server.addTool({
    name: 'appium_mobile_lock',
    description:
      'Lock the device. Optionally lock for a given number of seconds (both Android and iOS support automatic unlock after the timeout). If no timeout is provided, the device stays locked until appium_mobile_unlock is called. Supported on Android (UiAutomator2) and iOS (XCUITest).',
    parameters: lockSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof lockSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const params: { seconds?: number } = {};
        if (args.seconds !== undefined) {
          params.seconds = args.seconds;
        }
        await execute(driver, 'mobile: lock', params);
        const msg =
          args.seconds !== undefined
            ? `Device locked for ${args.seconds} second(s).`
            : 'Device locked.';
        return {
          content: [{ type: 'text', text: msg }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to lock device. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}

export function unlockDevice(server: FastMCP): void {
  const unlockSchema = z.object({
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_unlock',
    description:
      'Unlock the device if it is locked. No-op if already unlocked. Supported on Android (UiAutomator2) and iOS (XCUITest).',
    parameters: unlockSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof unlockSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await execute(driver, 'mobile: unlock', {});
        return {
          content: [{ type: 'text', text: 'Device unlocked.' }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to unlock device. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
