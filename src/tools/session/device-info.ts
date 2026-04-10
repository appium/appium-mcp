import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { BatteryState } from 'appium-xcuitest-driver/build/lib/commands/enum.js';

// iOS: maps UIDeviceBatteryState values to human-readable strings
// @see https://github.com/appium/appium-xcuitest-driver/blob/5bdad71/lib/commands/enum.ts#L91
const IOS_BATTERY_STATES: Record<number, string> = {
  [BatteryState.UIDeviceBatteryStateUnknown]: 'unknown',
  [BatteryState.UIDeviceBatteryStateUnplugged]: 'unplugged',
  [BatteryState.UIDeviceBatteryStateCharging]: 'charging',
  [BatteryState.UIDeviceBatteryStateFull]: 'full',
};

// Android: state matches BatteryManager constants
const ANDROID_BATTERY_STATES: Record<number, string> = {
  1: 'unknown',
  2: 'charging',
  3: 'discharging',
  4: 'not charging',
  5: 'full',
};

function formatBatteryInfo(
  platform: string,
  raw: { level?: number; state?: number }
): Record<string, string> {
  const levelPercent = Math.round((raw.level ?? 0) * 100);
  const states =
    platform === PLATFORM.ios ? IOS_BATTERY_STATES : ANDROID_BATTERY_STATES;
  return {
    platform: platform === PLATFORM.ios ? 'iOS' : 'Android',
    level: `${levelPercent}%`,
    state: states[raw.state ?? -1] ?? 'unknown',
  };
}

export default function deviceInfo(server: FastMCP): void {
  const schema = z.object({
    action: z
      .enum(['info', 'battery', 'time'])
      .describe(
        'Action to perform: "info" returns device model/OS/locale/etc., "battery" returns battery level and charging state, "time" returns the current device time.'
      ),
    format: z
      .string()
      .optional()
      .describe(
        'Only used when action is "time". moment.js format string for the returned time. Defaults to ISO 8601 (YYYY-MM-DDTHH:mm:ssZ).'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_device_info',
    description:
      'Get device information, battery status, or current device time in a single call. Use the "action" parameter to select which data to retrieve. Works on both iOS and Android.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        return {
          content: [{ type: 'text', text: 'No driver found' }],
          isError: true,
        };
      }

      if (args.action === 'info') {
        try {
          const result = await execute(driver, 'mobile: deviceInfo', {});
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (err: unknown) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get device info: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      if (args.action === 'battery') {
        try {
          const platform = getPlatformName(driver);
          const raw = await execute(driver, 'mobile: batteryInfo', {});
          const formatted = formatBatteryInfo(platform, raw);
          return {
            content: [
              { type: 'text', text: JSON.stringify(formatted, null, 2) },
            ],
          };
        } catch (err: unknown) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get battery info: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      if (args.action === 'time') {
        try {
          const params: Record<string, unknown> = {};
          if (args.format != null) {
            params.format = args.format;
          }
          const time = await execute(driver, 'mobile: getDeviceTime', params);
          return {
            content: [{ type: 'text', text: String(time) }],
          };
        } catch (err: unknown) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get device time: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [{ type: 'text', text: `Unknown action: ${args.action}` }],
        isError: true,
      };
    },
  });
}
