import { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { XCUITestDriver } from 'appium-xcuitest-driver';
import type { Client } from 'webdriver';
import log from './logger.js';

let driver: any = null;
let sessionId: string | null = null;
let isDeletingSession = false; // Lock to prevent concurrent deletion

export const PLATFORM = {
  android: 'Android',
  ios: 'iOS',
};

/**
 * Determine whether the provided driver represents a remote driver session.
 *
 * This checks for the presence of a string-valued `sessionId` property on the
 * driver object, which indicates a remote/WebDriver session.
 *
 * @param driver - The driver instance to inspect (may be a Client, AndroidUiautomator2Driver, XCUITestDriver, or null).
 * @returns `true` if `driver` is non-null and has a string `sessionId`; otherwise `false`.
 */
export function isRemoteDriverSession(
  driver: Client | AndroidUiautomator2Driver | XCUITestDriver | null
): boolean {
  if (driver) {
    return (
      !(driver instanceof AndroidUiautomator2Driver) &&
      !(driver instanceof XCUITestDriver)
    );
  }
  return false;
}

export function setSession(
  d: Client | AndroidUiautomator2Driver | XCUITestDriver,
  id: string | null
) {
  driver = d;
  sessionId = id;
  // Reset deletion flag when setting a new session
  if (d && id) {
    isDeletingSession = false;
  }
}

export function getDriver():
  | Client
  | AndroidUiautomator2Driver
  | XCUITestDriver {
  return driver;
}

export function getSessionId() {
  return sessionId;
}

export function isDeletingSessionInProgress() {
  return isDeletingSession;
}

export function hasActiveSession(): boolean {
  return driver !== null && sessionId !== null && !isDeletingSession;
}

export async function safeDeleteSession(): Promise<boolean> {
  // Check if there's no session to delete
  if (!driver || !sessionId) {
    log.info('No active session to delete.');
    return false;
  }

  // Check if deletion is already in progress
  if (isDeletingSession) {
    log.info('Session deletion already in progress, skipping...');
    return false;
  }

  // Set lock
  isDeletingSession = true;

  try {
    log.info('Deleting current session');
    await driver.deleteSession();

    // Clear the session from store
    driver = null;
    sessionId = null;

    log.info('Session deleted successfully.');
    return true;
  } catch (error) {
    log.error('Error deleting session:', error);
    throw error;
  } finally {
    // Always release lock
    isDeletingSession = false;
  }
}

export const getPlatformName = (driver: any): string => {
  if (driver instanceof AndroidUiautomator2Driver) {
    return PLATFORM.android;
  }
  if (driver instanceof XCUITestDriver) {
    return PLATFORM.ios;
  }

  if ((driver as Client).isAndroid) {
    return PLATFORM.android;
  } else if ((driver as Client).isIOS) {
    return PLATFORM.ios;
  }

  throw new Error('Unknown driver type');
};
