import type { ContentResult } from 'fastmcp';
import {
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
  type DriverInstance,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';

export async function deepLink(
  driver: DriverInstance,
  url: string,
  appId?: string,
  waitForLaunch?: boolean
): Promise<ContentResult> {
  try {
    if (isRemoteDriverSession(driver)) {
      const platform = getPlatformName(driver);
      if (platform === PLATFORM.android) {
        const params: Record<string, unknown> = { url };
        if (appId != null) {
          params.package = appId;
        }
        if (waitForLaunch != null) {
          params.waitForLaunch = waitForLaunch;
        }
        await execute(driver, 'mobile: deepLink', params);
      } else if (platform === PLATFORM.ios) {
        const params: Record<string, unknown> = { url };
        if (appId != null) {
          params.bundleId = appId;
        }
        await execute(driver, 'mobile: deepLink', params);
      } else {
        throw new Error(
          `Unsupported platform: ${platform}. Only Android and iOS are supported.`
        );
      }
    } else if (isAndroidUiautomator2DriverSession(driver)) {
      await (driver as AndroidUiautomator2Driver).mobileDeepLink(
        url,
        appId ?? undefined,
        waitForLaunch ?? true
      );
    } else if (isXCUITestDriverSession(driver)) {
      await (driver as XCUITestDriver).mobileDeepLink(url, appId ?? undefined);
    } else {
      throw new Error('Unsupported driver for deep link');
    }
    return {
      content: [
        {
          type: 'text',
          text: `Successfully opened deep link "${url}"${appId ? ` with app ${appId}` : ''}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to open deep link "${url}". err: ${err.toString()}`,
        },
      ],
    };
  }
}
