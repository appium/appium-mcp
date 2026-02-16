import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

export default function isAppInstalled(server: FastMCP): void {
  const schema = z.object({
    id: z
      .string()
      .describe('App identifier (package name for Android, bundle ID for iOS)'),
  });

  server.addTool({
    name: 'appium_is_app_installed',
    description:
      'Check whether an app is installed. Package name for Android, bundle ID for iOS.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>) => {
      const { id } = args;
      const driver = await getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }
      try {
        const platform = getPlatformName(driver);
        const params =
          platform === PLATFORM.android ? { appId: id } : { bundleId: id };
        const raw = await execute(driver, 'mobile: isAppInstalled', params);
        const installed =
          raw != null && typeof raw === 'object' && 'value' in raw
            ? (raw as { value: unknown }).value
            : raw;
        const result = Boolean(installed);
        return {
          content: [
            {
              type: 'text',
              text: result
                ? `App "${id}" is installed.`
                : `App "${id}" is not installed.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to check if app is installed. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
