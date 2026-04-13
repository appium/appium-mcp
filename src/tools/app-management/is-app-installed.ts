import type { ContentResult } from 'fastmcp';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';

export async function isInstalled(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }

    let result: boolean;
    if (isRemoteDriverSession(driver)) {
      const platform = getPlatformName(driver);
      const params =
        platform === PLATFORM.android ? { appId: id } : { bundleId: id };
      const raw = await execute(driver, 'mobile: isAppInstalled', params);
      result = Boolean(raw);
    } else if (isXCUITestDriverSession(driver)) {
      result = await (driver as XCUITestDriver).isAppInstalled(id);
    } else if (isAndroidUiautomator2DriverSession(driver)) {
      result = await (driver as AndroidUiautomator2Driver).adb.isAppInstalled(
        id
      );
    } else {
      throw new Error('Unsupported driver for is_installed');
    }

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
}
