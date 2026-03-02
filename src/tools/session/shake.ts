import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export default function shakeDevice(server: FastMCP): void {
  const shakeSchema = z.object({});

  server.addTool({
    name: 'appium_shake',
    description:
      'Perform a shake gesture on the device. Primarily supported on iOS (XCUITest); useful for triggering dev menus, undo, or app-specific shake actions. Android support may be limited or unsupported depending on the driver.',
    parameters: shakeSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      _args: z.infer<typeof shakeSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await execute(driver, 'mobile: shake', {});
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
