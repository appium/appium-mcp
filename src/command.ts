import type { Client } from 'webdriver';
import {
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
} from './session-store.js';
import type { DriverInstance } from './session-store.js';
import { StringRecord } from '@appium/types';

/**
 * Execute a driver command.
 *
 * This abstracts differences between Appium driver implementations and
 * the WebDriver `Client` interface. Drivers are narrowed using the
 * type-guard helpers from `session-store`.
 *
 * @param driver - The driver instance to execute the command on.
 * @param cmd - The command or script name.
 * @param params - Parameters for the command.
 * @returns The result of the executed command.
 */
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

/**
 * Activate an application by its bundle/package id on the device.
 *
 * Works across Android and iOS driver implementations as well as remote
 * WebDriver clients where supported.
 *
 * @param driver - The driver instance to use.
 * @param appId - Application identifier to activate.
 */
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

/**
 * Retrieve the current context (for hybrid apps, e.g. NATIVE_APP or a webview).
 *
 * @param driver - The driver instance to query.
 * @returns The name of the current context.
 */
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

/**
 * List available contexts for the current session (native and webview contexts).
 *
 * @param driver - The driver instance to query.
 * @returns Array of context names.
 */
export async function getContexts(driver: DriverInstance): Promise<string[]> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getContexts();
  } else if (isXCUITestDriverSession(driver)) {
    return (await driver.getContexts()) as string[];
  }
  throw new Error('getContexts is not supported');
}

/**
 * Switch the driver's context to the supplied context name.
 *
 * @param driver - The driver instance to operate on.
 * @param name - The context name to switch to (if omitted, behavior depends on driver).
 */
export async function setContext(
  driver: DriverInstance,
  name?: string
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    await driver.setContext(name);
  } else if (isXCUITestDriverSession(driver)) {
    await driver.setContext(name || null);
  }
  throw new Error('setContext is not supported');
}

/**
 * Set the value of an element.
 *
 * @param driver - The driver instance to use.
 * @param elementUUID - Element identifier.
 * @param text - Text to set into the element.
 * @returns Driver-specific result (often void or element value).
 */
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

/**
 * Click an element identified by UUID.
 *
 * @param driver - The driver instance to use.
 * @param elementUUID - Identifier of the element to click.
 */
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

/**
 * Get the bounding rectangle for an element.
 *
 * @param driver - The driver instance to query.
 * @param elementUUID - Element identifier.
 * @returns A `Rect` describing the element bounds.
 */
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

/**
 * Get the window rectangle for the current session.
 *
 * @param driver - The driver instance to query.
 * @returns A `Rect` describing the window bounds.
 */
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

/**
 * Perform low-level input actions (W3C Actions API) on the device.
 *
 * @param driver - The driver instance to use.
 * @param operation - Actions or action sequences to perform.
 */
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

/**
 * Retrieve the current page/source (often XML for native screens).
 *
 * @param driver - The driver instance to query.
 * @returns Page source as a string.
 */
export async function getPageSource(driver: DriverInstance): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getPageSource();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getPageSource();
  }
  return await driver.getPageSource();
}

/**
 * Capture a screenshot from the device/session.
 *
 * @param driver - The driver instance to capture from.
 * @returns Base64-encoded PNG string.
 */
export async function getScreenshot(driver: DriverInstance): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getScreenshot();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getScreenshot();
  }
  return await driver.takeScreenshot();
}

/**
 * Get the visible text from an element.
 *
 * @param driver - The driver instance to query.
 * @param elementUUID - Identifier of the element.
 * @returns The element's text content.
 */
export async function getElementText(
  driver: DriverInstance,
  elementUUID: string
): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getText(elementUUID);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getText(elementUUID);
  }
  return await driver.getElementText(elementUUID);
}
