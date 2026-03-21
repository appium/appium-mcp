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

export interface SessionSummary {
  sessionId: string;
  currentContext: string | null;
  isActive: boolean;
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  capabilities: SessionCapabilities;
}

export interface SessionGroupSummary {
  groupId: string;
  sessionIds: string[];
  isActive: boolean;
}

export type SessionTarget =
  | { kind: 'active' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'all' };

interface SessionMetadata {
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  capabilities: SessionCapabilities;
}

export interface SessionInfo {
  driver: DriverInstance;
  sessionId: string;
  currentContext: string | null;
  isDeletingSession: boolean;
  metadata: SessionMetadata;
}

interface SessionGroupInfo {
  groupId: string;
  sessionIds: Set<string>;
}

/**
 * In-memory store for active Appium sessions and their associated drivers.
 */
const sessions = new Map<string, SessionInfo>();
const sessionGroups = new Map<string, SessionGroupInfo>();
/**
 * The ID of the currently active session, or `null` if no session is active.
 */
let activeSessionId: string | null = null;
let activeSessionGroupId: string | null = null;

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
  capabilities: SessionCapabilities = {}
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
    metadata,
  });
  activeSessionId = id;
}

export function getSessionInfo(sessionId?: string): SessionInfo | null {
  const id = sessionId ?? activeSessionId;
  if (!id) {
    return null;
  }
  return sessions.get(id) ?? null;
}

export function getDriver(sessionId?: string): NullableDriverInstance {
  return getSessionInfo(sessionId)?.driver ?? null;
}

export function getSessionId() {
  return activeSessionId;
}

export function getActiveSessionGroupId() {
  return activeSessionGroupId;
}

function toSessionSummary(session: SessionInfo): SessionSummary {
  return {
    sessionId: session.sessionId,
    currentContext: session.currentContext,
    isActive: session.sessionId === activeSessionId,
    platform: session.metadata.platform,
    automationName: session.metadata.automationName,
    deviceName: session.metadata.deviceName,
    capabilities: session.metadata.capabilities,
  };
}

function toSessionGroupSummary(group: SessionGroupInfo): SessionGroupSummary {
  return {
    groupId: group.groupId,
    sessionIds: Array.from(group.sessionIds),
    isActive: group.groupId === activeSessionGroupId,
  };
}

export function listSessions(): SessionSummary[] {
  return Array.from(sessions.values()).map(toSessionSummary);
}

export function listSessionGroups(): SessionGroupSummary[] {
  return Array.from(sessionGroups.values()).map(toSessionGroupSummary);
}

export function setSessionGroup(
  groupId: string,
  sessionIds: string[]
): SessionGroupSummary {
  const uniqueSessionIds = Array.from(new Set(sessionIds)).filter((sessionId) =>
    sessions.has(sessionId)
  );

  if (!uniqueSessionIds.length) {
    throw new Error(
      'Cannot create a session group without at least one valid session ID.'
    );
  }

  const group: SessionGroupInfo = {
    groupId,
    sessionIds: new Set(uniqueSessionIds),
  };

  sessionGroups.set(groupId, group);
  return toSessionGroupSummary(group);
}

export function deleteSessionGroup(groupId: string): boolean {
  const deleted = sessionGroups.delete(groupId);
  if (deleted && activeSessionGroupId === groupId) {
    activeSessionGroupId = null;
  }
  return deleted;
}

export function setActiveSessionGroup(groupId: string): boolean {
  if (!sessionGroups.has(groupId)) {
    return false;
  }
  activeSessionGroupId = groupId;
  return true;
}

function getOperationalSessions(sessionList: SessionInfo[]): SessionInfo[] {
  return sessionList.filter((session) => !session.isDeletingSession);
}

export function resolveSessionTarget(
  target: SessionTarget = { kind: 'active' }
) {
  switch (target.kind) {
    case 'active': {
      const session = getSessionInfo();
      return session && !session.isDeletingSession ? [session] : [];
    }
    case 'session': {
      const session = getSessionInfo(target.sessionId);
      return session && !session.isDeletingSession ? [session] : [];
    }
    case 'group': {
      const group = sessionGroups.get(target.groupId);
      if (!group) {
        return [];
      }
      return getOperationalSessions(
        Array.from(group.sessionIds)
          .map((sessionId) => sessions.get(sessionId) ?? null)
          .filter((session): session is SessionInfo => session !== null)
      );
    }
    case 'all':
      return getOperationalSessions(Array.from(sessions.values()));
    default:
      return [];
  }
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

function removeSessionFromGroups(sessionId: string): void {
  for (const [groupId, group] of sessionGroups.entries()) {
    if (!group.sessionIds.delete(sessionId)) {
      continue;
    }

    if (group.sessionIds.size === 0) {
      sessionGroups.delete(groupId);
      if (activeSessionGroupId === groupId) {
        activeSessionGroupId = null;
      }
    }
  }
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
    removeSessionFromGroups(id);
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
  const sessionIds = Array.from(sessions.keys());

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

  if ((driver as Client).isAndroid) {
    return PLATFORM.android;
  } else if ((driver as Client).isIOS) {
    return PLATFORM.ios;
  }

  throw new Error('Unknown driver type');
};
