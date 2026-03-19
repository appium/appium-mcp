import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

// iOS: state is a number 0=unknown, 1=unplugged, 2=charging, 3=full
const IOS_BATTERY_STATES: Record<number, string> = {
  0: 'unknown',
  1: 'unplugged',
  2: 'charging',
  3: 'full',
};

// Android: state matches BatteryManager constants
const ANDROID_BATTERY_STATES: Record<number, string> = {
  1: 'unknown',
  2: 'charging',
  3: 'discharging',
  4: 'not charging',
  5: 'full',
};

export default function batteryInfo(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_battery_info',
    description:
      'Get the current battery level and charging state of the device. Works on both iOS and Android.',
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
        const platform = getPlatformName(driver);
        let formatted: Record<string, string | number>;

        const raw = await execute(driver, 'mobile: batteryInfo', {});
        const levelPercent = Math.round((raw.level ?? 0) * 100);
        if (platform === PLATFORM.ios) {
          formatted = {
            platform: 'iOS',
            level: `${levelPercent}%`,
            state: IOS_BATTERY_STATES[raw.state] ?? 'unknown',
          };
        } else {
          formatted = {
            platform: 'Android',
            level: `${levelPercent}%`,
            state: ANDROID_BATTERY_STATES[raw.state] ?? 'unknown',
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get battery info. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
