import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

// iOS: maps UIDeviceBatteryState values to human-readable strings
// @see https://developer.apple.com/documentation/uikit/uidevice/batterystate
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

export default function deviceInfo(server: FastMCP): void {
  const schema = z.object({
    action: z
      .enum(['info', 'battery', 'time'])
      .describe('info, battery, or device time.'),
    format: z
      .string()
      .optional()
      .describe('time-only moment.js format; default ISO 8601.'),
    sessionId: z
      .string()
      .optional()
      .describe('Target session; defaults to active.'),
  });

  server.addTool({
    name: 'appium_mobile_device_info',
    description: 'Read device metadata, battery, or time on iOS/Android.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      if (args.action === 'info') {
        try {
          const result = await execute(driver, 'mobile: deviceInfo', {});
          return textResult(JSON.stringify(result, null, 2));
        } catch (err: unknown) {
          return errorResult(
            `Failed to get device info: ${toolErrorMessage(err)}`
          );
        }
      }

      if (args.action === 'battery') {
        try {
          const platform = getPlatformName(driver);
          const raw = await execute(driver, 'mobile: batteryInfo', {});
          const formatted = formatBatteryInfo(platform, raw);
          return textResult(JSON.stringify(formatted, null, 2));
        } catch (err: unknown) {
          return errorResult(
            `Failed to get battery info: ${toolErrorMessage(err)}`
          );
        }
      }

      if (args.action === 'time') {
        try {
          const params: Record<string, unknown> = {};
          if (args.format != null) {
            params.format = args.format;
          }
          const time = await execute(driver, 'mobile: getDeviceTime', params);
          return textResult(String(time));
        } catch (err: unknown) {
          return errorResult(
            `Failed to get device time: ${toolErrorMessage(err)}`
          );
        }
      }

      return errorResult(`Unknown action: ${args.action}`);
    },
  });
}

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
