import { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { XCUITestDriver } from 'appium-xcuitest-driver';
import type { Client } from 'webdriver';
import log from './logger.js';

// Type aliases for driver variants used throughout the project.
export type DriverInstance =
  | Client
  | AndroidUiautomator2Driver
  | XCUITestDriver;
export type NullableDriverInstance = DriverInstance | null;
export type SessionCapabilities = Record<string, any>;
export type SessionOwnership = 'owned' | 'attached';

interface SessionMetadata {
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  capabilities: SessionCapabilities;
}

interface SessionInfo {
  driver: DriverInstance;
  sessionId: string;
  currentContext: string | null;
  isDeletingSession: boolean;
  ownership: SessionOwnership;
  metadata: SessionMetadata;
}

/**
 * In-memory store for active Appium sessions and their associated drivers.
 */
const sessions = new Map<string, SessionInfo>();
/**
 * The ID of the currently active session, or `null` if no session is active.
 */
let activeSessionId: string | null = null;

export const PLATFORM = {
  android: 'Android',
  ios: 'iOS',
};

/**
 * Determine whether the provided driver represents a remote Appium session
 * (i.e. a `Client` obtained via `WebDriver.newSession`) rather than an
 * in-process `AndroidUiautomator2Driver` or `XCUITestDriver`.
 *
 * @param driver - The driver instance to inspect.
 * @returns `true` if `driver` is non-null and not an embedded Appium driver.
 */
export function isRemoteDriverSession(driver: NullableDriverInstance): boolean {
  if (driver) {
    return (
      !(driver instanceof AndroidUiautomator2Driver) &&
      !(driver instanceof XCUITestDriver)
    );
  }
  return false;
}

/**
 * Type-guard that asserts the provided driver is an Android UiAutomator2 driver.
 *
 * Performs a runtime `instanceof` check. When this function returns `true`,
 * TypeScript will narrow the variable's type to `AndroidUiautomator2Driver`.
 * Use this helper to safely call Android-specific driver methods without
 * casting.
 *
 * @param driver - The driver instance to test (may be a `Client`,
 *   `AndroidUiautomator2Driver`, `XCUITestDriver`, or `null`).
 * @returns `true` if `driver` is an `AndroidUiautomator2Driver`.
 */
export function isAndroidUiautomator2DriverSession(
  driver: NullableDriverInstance
): driver is AndroidUiautomator2Driver {
  return driver instanceof AndroidUiautomator2Driver;
}

/**
 * Type-guard that asserts the provided driver is an XCUITest (iOS) driver.
 *
 * Performs a runtime `instanceof` check and narrows the type to
 * `XCUITestDriver` when true. This lets callers invoke iOS-specific driver
 * APIs without explicit casts.
 *
 * @param driver - The driver instance to test (may be a `Client`,
 *   `AndroidUiautomator2Driver`, `XCUITestDriver`, or `null`).
 * @returns `true` if `driver` is an `XCUITestDriver`.
 */
export function isXCUITestDriverSession(
  driver: NullableDriverInstance
): driver is XCUITestDriver {
  return driver instanceof XCUITestDriver;
}

export function setSession(
  d: DriverInstance,
  id: string | null,
  capabilities: SessionCapabilities = {},
  ownership: SessionOwnership = 'owned'
) {
  if (!id) {
    activeSessionId = null;
    return;
  }

  const metadata: SessionMetadata = {
    platform:
      (capabilities.platformName as string | undefined) ??
      (capabilities['appium:platformName'] as string | undefined) ??
      null,
    automationName:
      (capabilities['appium:automationName'] as string | undefined) ?? null,
    deviceName:
      (capabilities['appium:deviceName'] as string | undefined) ??
      (capabilities.deviceName as string | undefined) ??
      null,
    capabilities,
  };

  sessions.set(id, {
    driver: d,
    sessionId: id,
    currentContext: 'NATIVE_APP',
    isDeletingSession: false,
    ownership,
    metadata,
  });
  activeSessionId = id;
}

export function getDriver(sessionId?: string): NullableDriverInstance {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return null;
  }
  return sessions.get(id)?.driver ?? null;
}

export function getSessionId() {
  return activeSessionId;
}

export function listSessions(): Array<{
  sessionId: string;
  currentContext: string | null;
  isActive: boolean;
  ownership: SessionOwnership;
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  capabilities: SessionCapabilities;
}> {
  return Array.from(sessions.values()).map((session) => ({
    sessionId: session.sessionId,
    currentContext: session.currentContext,
    isActive: session.sessionId === activeSessionId,
    ownership: session.ownership,
    platform: session.metadata.platform,
    automationName: session.metadata.automationName,
    deviceName: session.metadata.deviceName,
    capabilities: session.metadata.capabilities,
  }));
}

export function getSessionOwnership(
  sessionId?: string
): SessionOwnership | null {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return null;
  }
  return sessions.get(id)?.ownership ?? null;
}

export function setActiveSession(sessionId: string): boolean {
  if (!sessions.has(sessionId)) {
    return false;
  }
  activeSessionId = sessionId;
  return true;
}

export function setCurrentContext(
  context: string,
  sessionId?: string
): boolean {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return false;
  }

  const session = sessions.get(id);
  if (!session) {
    return false;
  }

  session.currentContext = context;
  return true;
}

export function getCurrentContext(sessionId?: string): string | null {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return null;
  }
  return sessions.get(id)?.currentContext ?? null;
}

export function isDeletingSessionInProgress(sessionId?: string) {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return false;
  }
  return sessions.get(id)?.isDeletingSession ?? false;
}

export function hasActiveSession(): boolean {
  if (!activeSessionId) {
    return false;
  }
  const session = sessions.get(activeSessionId);
  return !!session && !session.isDeletingSession;
}

function selectNextActiveSessionId(deletedSessionId: string): string | null {
  if (activeSessionId !== deletedSessionId) {
    return activeSessionId;
  }

  const nextSession = Array.from(sessions.keys()).find(
    (id) => id !== deletedSessionId
  );
  return nextSession ?? null;
}

export function detachSession(sessionId?: string): boolean {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    log.info('No active session to detach.');
    return false;
  }

  const session = sessions.get(id);
  if (!session) {
    log.info(`Session ${id} not found.`);
    return false;
  }

  sessions.delete(id);
  activeSessionId = selectNextActiveSessionId(id);
  log.info(`Session ${id} detached successfully.`);
  return true;
}

export async function safeDeleteSession(sessionId?: string): Promise<boolean> {
  const id = sessionId ?? activeSessionId;

  if (!id) {
    log.info('No active session to delete.');
    return false;
  }

  const session = sessions.get(id);

  // Check if there's no session to delete
  if (!session) {
    log.info(`Session ${id} not found.`);
    return false;
  }

  // Check if deletion is already in progress
  if (session.isDeletingSession) {
    log.info(`Session ${id} deletion already in progress, skipping...`);
    return false;
  }

  // Set lock
  session.isDeletingSession = true;

  try {
    log.info(`Deleting session ${id}`);
    await session.driver.deleteSession();

    // Clear the session from store
    sessions.delete(id);
    activeSessionId = selectNextActiveSessionId(id);

    log.info(`Session ${id} deleted successfully.`);
    return true;
  } catch (error) {
    log.error('Error deleting session:', error);
    throw error;
  } finally {
    // Always release lock
    const existingSession = sessions.get(id);
    if (existingSession) {
      existingSession.isDeletingSession = false;
    }
  }
}

export async function safeDeleteAllSessions(): Promise<number> {
  let deletedCount = 0;
  const sessionIds = Array.from(sessions.values())
    .filter((session) => session.ownership === 'owned')
    .map((session) => session.sessionId);

  for (const sessionId of sessionIds) {
    try {
      const deleted = await safeDeleteSession(sessionId);
      if (deleted) {
        deletedCount += 1;
      }
    } catch (error) {
      log.error(`Error deleting session ${sessionId}:`, error);
    }
  }

  return deletedCount;
}

export const getPlatformName = (driver: any): string => {
  if (driver instanceof AndroidUiautomator2Driver) {
    return PLATFORM.android;
  }
  if (driver instanceof XCUITestDriver) {
    return PLATFORM.ios;
  }

  const client = driver as Client;
  if (client.isAndroid) {
    return PLATFORM.android;
  }
  if (client.isIOS) {
    return PLATFORM.ios;
  }

  const session = listSessions().find((s) => s.sessionId === client.sessionId);
  if (session && session.platform) {
    return session.platform;
  }

  throw new Error('Unknown driver type');
};
