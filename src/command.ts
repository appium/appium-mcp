import type { Client } from 'webdriver';
import {
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
  getCurrentContext as getStorecCurrentContext,
} from './session-store.js';
import type { DriverInstance } from './session-store.js';
import type { StringRecord, Element as AppiumElement } from '@appium/types';
import { util } from '@appium/support';
import type {
  IOSRecordingOptions,
  AndroidRecordingOptions,
} from './tools/interactions/screen-recording.js';

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
 * Query the current state of an application.
 *
 * Returns a numeric value:
 *   0 = not installed, 1 = not running, 2 = background (suspended),
 *   3 = background, 4 = foreground
 *
 * @param driver - The driver instance to use.
 * @param appId - Application identifier to query.
 * @returns Numeric app state.
 */
export async function queryAppState(
  driver: DriverInstance,
  appId: string
): Promise<number> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.queryAppState(appId);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.queryAppState(appId);
  }
  return Number(
    await (driver as Client).executeScript('mobile: queryAppState', [
      { bundleId: appId },
    ])
  );
}

/**
 * Read current Appium driver session settings (embedded drivers or remote
 * WebDriver `GET /session/:id/appium/settings`).
 */
export async function getSessionDriverSettings(
  driver: DriverInstance
): Promise<StringRecord<unknown>> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getSettings();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getSettings();
  }
  return await (driver as Client).getSettings();
}

/**
 * Update Appium driver session settings (embedded drivers or remote WebDriver
 * `POST /session/:id/appium/settings`).
 */
export async function updateSessionDriverSettings(
  driver: DriverInstance,
  settings: StringRecord<unknown>
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    await driver.updateSettings(settings as never);
  } else if (isXCUITestDriverSession(driver)) {
    await driver.updateSettings(settings);
  } else {
    await (driver as Client).updateSettings(settings);
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
    return await driver.activateApp(appId);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.activateApp(appId);
  }
  return await (driver as Client).activateApp(appId);
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
  } else if (isRemoteDriverSession(driver)) {
    return String(await (driver as Client).getAppiumContext());
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
  } else if (isRemoteDriverSession(driver)) {
    const contexts = await (driver as Client).getAppiumContexts();
    return contexts.map((c) => (typeof c === 'string' ? c : String(c)));
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
    return await driver.setContext(name);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.setContext(name || null);
  } else if (isRemoteDriverSession(driver)) {
    if (name == null || name === '') {
      throw new Error('Context name is required');
    }
    return await (driver as Client).switchAppiumContext(name);
  }
  throw new Error('setContext is not supported');
}

/**
 * Build a W3C Actions API key sequence for the given text.
 * Each character is emitted as a keyDown+keyUp pair so it works
 * on both Android and iOS without relying on driver-specific setValue.
 *
 * @param text - The text to type.
 * @returns A W3C `key` action sequence object.
 */
export function buildW3cKeyActions(text: string): StringRecord<any> {
  const actions = text.split('').flatMap((char) => [
    { type: 'keyDown', value: char },
    { type: 'keyUp', value: char },
  ]);

  return {
    type: 'key',
    id: 'keyboard',
    actions,
  };
}

/**
 * Set the value of an element.
 *
 * @param driver - The driver instance to use.
 * @param elementUUID - Element identifier.
 * @param text - Text to set into the element.
 * @param w3cActions - When true, use the W3C Actions API (performActions) instead
 *   of the driver-specific setValue. Works on both Android and iOS.
 * @returns Driver-specific result (often void or element value).
 */
export async function setValue(
  driver: DriverInstance,
  elementUUID: string,
  text: string,
  w3cActions = false
) {
  if (w3cActions) {
    return await performActions(driver, [buildW3cKeyActions(text)]);
  }
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
  // iOS platform, AND for WebView context
  // TODO: this should consider nativeWebTap capability and not just platform + context
  if (
    getPlatformName(driver.sessionId) === PLATFORM.ios &&
    getStorecCurrentContext(driver.sessionId as string | undefined)?.startsWith(
      'WEBVIEW_'
    )
  ) {
    return await execute(
      driver,
      'arguments[0].click();',
      util.wrapElement(elementUUID)
    );
  }

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
export async function getScreenshot(
  driver: DriverInstance,
  elementId?: string
): Promise<string> {
  if (elementId) {
    if (isAndroidUiautomator2DriverSession(driver)) {
      return await driver.getElementScreenshot(elementId);
    } else if (isXCUITestDriverSession(driver)) {
      return await driver.getElementScreenshot(elementId);
    }
    return await driver.takeElementScreenshot(elementId);
  }

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

/**
 * Get the value of an element's attribute.
 *
 * @param driver - The driver instance to query.
 * @param elementUUID - Identifier of the element.
 * @param attribute - Name of the attribute to retrieve.
 * @returns The attribute value as a string, or null if not set.
 */
export async function getElementAttribute(
  driver: DriverInstance,
  elementUUID: string,
  attribute: string
): Promise<string | null> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getAttribute(attribute, elementUUID);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.getAttribute(attribute, elementUUID);
  }
  return await driver.getElementAttribute(elementUUID, attribute);
}

export async function getActiveElement(
  driver: DriverInstance
): Promise<AppiumElement> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.active();
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.active();
  }
  const result = await driver.getActiveElement();
  return result as unknown as AppiumElement;
}

/**
 * Get the current device/screen orientation.
 *
 * @param driver - The driver instance to query.
 * @returns Orientation string: LANDSCAPE or PORTRAIT.
 */
export async function getOrientation(
  driver: DriverInstance
): Promise<'LANDSCAPE' | 'PORTRAIT'> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.getOrientation();
  } else if (isXCUITestDriverSession(driver)) {
    return (await driver.proxyCommand('/orientation', 'GET')) as
      | 'LANDSCAPE'
      | 'PORTRAIT';
  }
  return (await driver.getOrientation()) as 'LANDSCAPE' | 'PORTRAIT';
}

/**
 * Set the device/screen orientation.
 *
 * @param driver - The driver instance to use.
 * @param orientation - LANDSCAPE or PORTRAIT.
 */
export async function setOrientation(
  driver: DriverInstance,
  orientation: 'LANDSCAPE' | 'PORTRAIT'
): Promise<void> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.setOrientation(orientation);
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.proxyCommand('/orientation', 'POST', { orientation });
  }
  return await driver.setOrientation(orientation);
}

/**
 * Start recording the device screen.
 *
 * @param driver - The driver instance to use.
 * @param options - Platform-specific recording options.
 * @returns Base64-encoded video of any previously active recording, or empty string.
 */
export async function startRecordingScreen(
  driver: DriverInstance,
  options: IOSRecordingOptions | AndroidRecordingOptions = {}
): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.startRecordingScreen(
      options as AndroidRecordingOptions
    );
  } else if (isXCUITestDriverSession(driver)) {
    return await driver.startRecordingScreen(options as IOSRecordingOptions);
  }
  throw new Error('startRecordingScreen is not supported for this driver');
}

/**
 * Stop an active screen recording and return the video.
 *
 * @param driver - The driver instance to use.
 * @returns Base64-encoded MP4 video content.
 */
export async function stopRecordingScreen(
  driver: DriverInstance
): Promise<string> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    return await driver.stopRecordingScreen({});
  } else if (isXCUITestDriverSession(driver)) {
    return (await driver.stopRecordingScreen({})) ?? '';
  }
  throw new Error('stopRecordingScreen is not supported for this driver');
}

/**
 * Get the current window size of the device screen.
 *
 * @param driver - The driver instance to query.
 * @returns An object with `width` and `height` in pixels.
 */
export async function getWindowSize(
  driver: DriverInstance
): Promise<{ width: number; height: number }> {
  if (isAndroidUiautomator2DriverSession(driver)) {
    const { width, height } = await driver.getWindowRect();
    return { width, height };
  } else if (isXCUITestDriverSession(driver)) {
    const { width, height } = await driver.getWindowRect();
    return { width, height };
  }
  const { width, height } = await (driver as Client).getWindowRect();
  return { width, height };
}

/**
 * Get the current clipboard content as plain text.
 *
 * Uses the `mobile: getClipboard` execute command which works uniformly
 * across Android (UiAutomator2), iOS (XCUITest), and remote WebDriver
 * clients. The driver returns a base64-encoded string which is decoded
 * before returning.
 *
 * @param driver - The driver instance to query.
 * @returns The clipboard content as a plain string (may be empty).
 */
export async function getClipboard(driver: DriverInstance): Promise<string> {
  const result = await execute(driver, 'mobile: getClipboard', {});
  if (!result) {
    return '';
  }
  return Buffer.from(String(result), 'base64').toString('utf-8');
}

/**
 * Set the clipboard content to the provided plain text.
 *
 * Uses the `mobile: setClipboard` execute command which works uniformly
 * across Android (UiAutomator2), iOS (XCUITest), and remote WebDriver
 * clients. The content is base64-encoded before sending.
 *
 * @param driver - The driver instance to use.
 * @param content - Plain text string to write to the clipboard.
 */
export async function setClipboard(
  driver: DriverInstance,
  content: string
): Promise<void> {
  const base64Content = Buffer.from(content, 'utf-8').toString('base64');
  await execute(driver, 'mobile: setClipboard', {
    content: base64Content,
    contentType: 'plaintext',
  });
}
