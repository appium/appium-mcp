import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import { BatteryState } from 'appium-xcuitest-driver/build/lib/commands/enum.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

const IOS_BATTERY_STATES: Record<number, string> = {
  [BatteryState.UIDeviceBatteryStateUnknown]: 'unknown',
  [BatteryState.UIDeviceBatteryStateUnplugged]: 'unplugged',
  [BatteryState.UIDeviceBatteryStateCharging]: 'charging',
  [BatteryState.UIDeviceBatteryStateFull]: 'full',
};

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

const schema = z.object({
  action: z
    .enum([
      'info',
      'battery',
      'time',
      'shake',
      'lock',
      'unlock',
      'notifications',
    ])
    .describe(
      'Action to perform. ' +
        'info: device model/OS/locale/etc. ' +
        'battery: battery level and charging state. ' +
        'time: current device time (optional format). ' +
        'shake: perform a shake gesture (iOS XCUITest only). ' +
        'lock: lock the device (optional seconds for auto-unlock). ' +
        'unlock: unlock the device. ' +
        'notifications: open the Android notifications panel (Android only).'
    ),
  format: z
    .string()
    .optional()
    .describe(
      'Used with: time. moment.js format string for the returned time. Defaults to ISO 8601 (YYYY-MM-DDTHH:mm:ssZ).'
    ),
  seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Used with: lock. How long to lock the screen in seconds before it is automatically unlocked. If omitted, the device stays locked until action=unlock is called.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

type DeviceArgs = z.infer<typeof schema>;

function textResult(text: string, isError = false): ContentResult {
  return { content: [{ type: 'text', text }], ...(isError && { isError }) };
}

async function handleInfo(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  const result = await execute(driver, 'mobile: deviceInfo', {});
  return textResult(JSON.stringify(result, null, 2));
}

async function handleBattery(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  const platform = getPlatformName(driver);
  const raw = await execute(driver, 'mobile: batteryInfo', {});
  return textResult(JSON.stringify(formatBatteryInfo(platform, raw), null, 2));
}

async function handleTime(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  const params: Record<string, unknown> = {};
  if (args.format != null) {
    params.format = args.format;
  }
  const time = await execute(driver, 'mobile: getDeviceTime', params);
  return textResult(String(time));
}

async function handleShake(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  if (!isXCUITestDriverSession(driver)) {
    return textResult(
      'Shake is supported only with XCUITest driver sessions. Other driver types are not supported.'
    );
  }
  await (driver as any).mobileShake();
  return textResult('Shake action performed.');
}

async function handleLock(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  const params: { seconds?: number } = {};
  if (args.seconds !== undefined) {
    params.seconds = args.seconds;
  }
  await execute(driver, 'mobile: lock', params);
  return textResult(
    args.seconds !== undefined
      ? `Device locked for ${args.seconds} second(s).`
      : 'Device locked.'
  );
}

async function handleUnlock(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  await execute(driver, 'mobile: unlock', {});
  return textResult('Device unlocked.');
}

async function handleNotifications(args: DeviceArgs): Promise<ContentResult> {
  const driver = getDriver(args.sessionId)!;
  const platform = getPlatformName(driver);
  if (platform !== PLATFORM.android) {
    return textResult(
      `Unsupported platform: ${platform}. Open notifications is supported on Android only.`
    );
  }
  if (isAndroidUiautomator2DriverSession(driver)) {
    await (driver as AndroidUiautomator2Driver).openNotifications();
  } else if (isRemoteDriverSession(driver)) {
    await execute(driver, 'mobile: openNotifications', {});
  } else {
    throw new Error('Unsupported Android driver for open notifications');
  }
  return textResult('Successfully opened notifications panel.');
}

export default function device(server: FastMCP): void {
  server.addTool({
    name: 'appium_device',
    description:
      'Device management: query device state (info, battery, time) or perform device actions (shake, lock, unlock, open notifications). Use the "action" parameter to select the operation. Works on iOS and Android except where noted: shake is iOS XCUITest only; notifications is Android only.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: DeviceArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        return textResult('No driver found', true);
      }

      try {
        switch (args.action) {
          case 'info':
            return await handleInfo(args);
          case 'battery':
            return await handleBattery(args);
          case 'time':
            return await handleTime(args);
          case 'shake':
            return await handleShake(args);
          case 'lock':
            return await handleLock(args);
          case 'unlock':
            return await handleUnlock(args);
          case 'notifications':
            return await handleNotifications(args);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return textResult(
          `Failed to perform ${args.action}. err: ${message}`,
          true
        );
      }
    },
  });
}
