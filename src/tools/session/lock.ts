import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

const deviceLockSchema = z.object({
  action: z
    .enum(['lock', 'unlock'])
    .describe(
      'lock: call mobile: lock (optional seconds for auto-unlock). unlock: call mobile: unlock.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
  seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Only for action=lock: lock duration in seconds before auto-unlock (Android UiAutomator2 and iOS XCUITest). Omit to stay locked until unlock.'
    ),
});

export default function mobileDeviceLock(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_device_lock',
    description:
      'Lock or unlock the device in one tool. action=lock uses mobile: lock (optional seconds for timed lock). action=unlock uses mobile: unlock. Supported on Android (UiAutomator2) and iOS (XCUITest).',
    parameters: deviceLockSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof deviceLockSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        const driver = getDriver(args.sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }

        if (args.action === 'unlock') {
          if (args.seconds !== undefined) {
            throw new Error('seconds is only valid when action is lock');
          }
          await execute(driver, 'mobile: unlock', {});
          return {
            content: [{ type: 'text', text: 'Device unlocked.' }],
          };
        }

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
              text: `Failed device lock action ${args.action}. err: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
