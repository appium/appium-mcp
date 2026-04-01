import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import {
  getSessionDriverSettings,
  updateSessionDriverSettings,
} from '../../command.js';

const updateSettingsSchema = z.object({
  settings: z
    .record(z.string(), z.any())
    .describe(
      'Key-value map of Appium driver settings to merge into the current session. ' +
        'Valid keys depend on the driver (e.g. Android UiAutomator2: waitForIdleTimeout, ' +
        'waitForSelectorTimeout, ignoreUnimportantViews; iOS XCUITest has its own set). ' +
        'Call appium_get_settings first to inspect current values.'
    ),
});

export default function driverSettings(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_settings',
    description:
      'Read current Appium driver session settings (e.g. idle timeouts, animation flags, ' +
      'selector waits). Use this to tune stability for agent-driven flows. Works for embedded ' +
      'UiAutomator2/XCUITest sessions and remote WebDriver clients that support Appium settings.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      _args: Record<string, never>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const settings = await getSessionDriverSettings(driver);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(settings, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get driver settings. Error: ${message}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'appium_update_settings',
    description:
      'Update Appium driver session settings by merging the provided map into the current ' +
      'configuration. Useful to reduce flakiness (e.g. adjust waitForIdleTimeout) or toggle ' +
      'driver-specific behavior. Keys are driver-specific; use appium_get_settings to see ' +
      'what is supported.',
    parameters: updateSettingsSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof updateSettingsSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await updateSessionDriverSettings(driver, args.settings);
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully updated driver settings.',
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to update driver settings. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
