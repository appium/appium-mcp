import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isXCUITestDriverSession } from '../../session-store.js';

export default function shakeDevice(server: FastMCP): void {
  const shakeSchema = z.object({
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_shake',
    description:
      'Perform a shake gesture via Appium `mobile: shake` using the XCUITest driver. ' +
      'Other driver types are not supported.',
    parameters: shakeSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof shakeSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      if (!isXCUITestDriverSession(driver)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Shake is supported only with XCUITest driver sessions. Other driver types are not supported.',
            },
          ],
        };
      }

      try {
        await (driver as any).mobileShake();
        return {
          content: [{ type: 'text', text: 'Shake action performed.' }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform shake. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
