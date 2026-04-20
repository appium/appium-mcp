import type { ContentResult } from 'fastmcp';
import {
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function deepLink(
  url: string,
  appId?: string,
  waitForLaunch?: boolean,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

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

    return textResult(
      `Successfully opened deep link "${url}"${appId ? ` with app ${appId}` : ''}`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to open deep link "${url}". err: ${toolErrorMessage(err)}`
    );
  }
}
