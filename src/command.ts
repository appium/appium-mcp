import type { Client } from 'webdriver';
import {
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
} from './session-store.js';
import type { DriverInstance } from './session-store.js';
import { StringRecord } from '@appium/types';

export async function execute(
  driver: DriverInstance,
  cmd: string,
  params: any
): Promise<any> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.execute(cmd, params);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.execute(cmd, params);
  } else {
    return await (driver as Client).executeScript(cmd, [params]);
  }
}

export async function activateApp(
  driver: DriverInstance,
  appId: string
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    await driver.activateApp(appId);
  } else if (isXCUITestDriverSession(driver)) {
    await driver.activateApp(appId);
  } else {
    await (driver as Client).activateApp(appId);
  }
}

export async function getCurrentContext(
  driver: DriverInstance
): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getCurrentContext();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getCurrentContext();
  }
  throw new Error('getCurrentContext is not supported');
}

export async function getContexts(driver: DriverInstance): Promise<string[]> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getContexts();
  } else if (isXCUITestDriverSession(driver)) {
    return (await driver.getContexts()) as string[];
  }
  throw new Error('getContexts is not supported');
}

export async function setContext(
  driver: DriverInstance,
  name?: string
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    await driver.setContext(name);
  } else if (isXCUITestDriverSession(driver)) {
    await driver.setContext(name);
  }
  throw new Error('setContext is not supported');
}

export async function setValue(
  driver: DriverInstance,
  elementUUID: string,
  text: string
) {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.setValue(text, elementUUID);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.setValue(text, elementUUID);
  }
  return await (driver as Client).elementSendKeys(elementUUID, text);
}

export async function elementClick(
  driver: DriverInstance,
  elementUUID: string
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.click(elementUUID);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.click(elementUUID);
  }
  return await driver.elementClick(elementUUID);
}

export async function getElementRect(
  driver: DriverInstance,
  elementUUID: string
): Promise<import('@appium/types').Rect> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getElementRect(elementUUID);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getElementRect(elementUUID);
  }
  return await driver.getElementRect(elementUUID);
}

export async function getWindowRect(
  driver: DriverInstance
): Promise<import('@appium/types').Rect> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getWindowRect();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getWindowRect();
  }
  return await driver.getWindowRect();
}

export async function performActions(
  driver: DriverInstance,
  operation: StringRecord<any>[] | import('@appium/types').ActionSequence[]
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.performActions(operation);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.performActions(
      operation as import('@appium/types').ActionSequence[]
    );
  }
  return await driver.performActions(operation);
}

export async function getPageSource(driver: DriverInstance): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getPageSource();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getPageSource();
  }
  return await driver.getPageSource();
}
