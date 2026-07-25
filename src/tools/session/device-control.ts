import type { ContentResult, FastMCP } from 'fastmcp';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { z } from 'zod';
import {
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
  type DriverInstance,
} from '../../session-store.js';
import { execute } from '../../command.js';
import {
  errorResult,
  platformMismatch,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';

const deviceControlSchema = z.object({
  action: z
    .enum(['lock', 'unlock', 'shake', 'open_notifications'])
    .describe(
      'lock/unlock; shake is iOS-only; open_notifications is Android-only.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
  seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Timed lock seconds; omit to remain locked.'),
});

export default function mobileDeviceControl(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_device_control',
    description: 'Lock/unlock, shake, or open notifications.',
    parameters: deviceControlSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof deviceControlSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      if (args.action !== 'lock' && args.seconds !== undefined) {
        return errorResult('seconds is only valid when action is lock');
      }

      try {
        switch (args.action) {
          case 'lock':
            return await handleLock(driver, args.seconds);
          case 'unlock':
            return await handleUnlock(driver);
          case 'shake':
            return await handleShake(driver);
          case 'open_notifications':
            return await handleOpenNotifications(driver);
        }
      } catch (err: unknown) {
        return errorResult(
          `Failed device control action ${args.action}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}

async function handleLock(
  driver: DriverInstance,
  seconds?: number
): Promise<ContentResult> {
  const params: { seconds?: number } = {};
  if (seconds !== undefined) {
    params.seconds = seconds;
  }
  await execute(driver, 'mobile: lock', params);
  const msg =
    seconds !== undefined
      ? `Device locked for ${seconds} second(s).`
      : 'Device locked.';
  return textResult(msg);
}

async function handleUnlock(driver: DriverInstance): Promise<ContentResult> {
  await execute(driver, 'mobile: unlock', {});
  return textResult('Device unlocked.');
}

async function handleShake(driver: DriverInstance): Promise<ContentResult> {
  if (!isXCUITestDriverSession(driver)) {
    return platformMismatch('shake', 'iOS', getPlatformName(driver));
  }
  await (driver as any).mobileShake();
  return textResult('Shake action performed.');
}

async function handleOpenNotifications(
  driver: DriverInstance
): Promise<ContentResult> {
  const platform = getPlatformName(driver);
  if (platform !== PLATFORM.android) {
    return platformMismatch('open_notifications', 'Android', platform);
  }

  if (isAndroidUiautomator2DriverSession(driver)) {
    await (driver as AndroidUiautomator2Driver).openNotifications();
  } else if (isRemoteDriverSession(driver)) {
    await execute(driver, 'mobile: openNotifications', {});
  } else {
    return errorResult('Unsupported Android driver for open notifications');
  }

  return textResult('Successfully opened notifications panel.');
}
