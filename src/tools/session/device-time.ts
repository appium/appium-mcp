import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export default function deviceTime(server: FastMCP): void {
  const schema = z.object({
    format: z
      .string()
      .optional()
      .describe(
        'moment.js format string for the returned time. Defaults to ISO 8601 (YYYY-MM-DDTHH:mm:ssZ).'
      ),
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_get_device_time',
    description:
      'Get the current time on the device. Works on both iOS and Android.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const params: Record<string, unknown> = {};
        if (args.format != null) {
          params.format = args.format;
        }
        const time = await execute(driver, 'mobile: getDeviceTime', params);

        return {
          content: [
            {
              type: 'text',
              text: String(time),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get device time. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
