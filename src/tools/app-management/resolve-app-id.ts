import {
  getSessionId,
  getDriver,
  getPlatformName,
  PLATFORM,
  isXCUITestDriverSession,
} from '../../session-store.js';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import { listAppsFromDevice } from './list-apps.js';

interface CacheEntry {
  apps: { packageName: string; appName: string }[];
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
const appListCache = new Map<string, CacheEntry>();

function getCacheKey(sessionId?: string): string {
  return sessionId ?? getSessionId() ?? '__default__';
}

export function invalidateAppListCache(sessionId?: string): void {
  appListCache.delete(getCacheKey(sessionId));
}

async function getInstalledApps(
  sessionId?: string
): Promise<{ packageName: string; appName: string }[]> {
  const key = getCacheKey(sessionId);
  const cached = appListCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.apps;
  }

  const driver = getDriver(sessionId);
  const platform = driver ? getPlatformName(driver) : null;

  let apps: { packageName: string; appName: string }[];
  const isSimulator =
    driver && isXCUITestDriverSession(driver)
      ? (driver as XCUITestDriver).isSimulator()
      : false;

  if (platform === PLATFORM.ios && !isSimulator) {
    // Real iOS device: User and System app lists are separate — fetch both in parallel.
    // Use allSettled so a failure on one type (e.g. System) doesn't discard the other.
    const results = await Promise.allSettled([
      listAppsFromDevice('User', sessionId),
      listAppsFromDevice('System', sessionId),
    ]);
    const seen = new Set<string>();
    apps = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const app of result.value) {
          if (!seen.has(app.packageName)) {
            seen.add(app.packageName);
            apps.push(app);
          }
        }
      }
    }
  } else {
    // Android or iOS Simulator: single call returns all apps
    apps = await listAppsFromDevice('User', sessionId);
  }

  appListCache.set(key, { apps, timestamp: Date.now() });
  return apps;
}

/**
 * Resolve a human-readable app name to an installed package/bundle ID using
 * fuzzy string matching. Matching priority (highest first):
 *   1. Exact display name match (case-insensitive)
 *   2. Display name starts with query
 *   3. Display name contains query
 *   4. Package name last segment contains query
 *   5. Full package name contains query
 *
 * Throws if no match is found.
 */
export async function resolveId(
  id: string | undefined,
  name: string | undefined,
  sessionId?: string
): Promise<string> {
  if (id !== undefined) {
    if (!id.trim()) {
      throw new Error('App id must not be empty or whitespace.');
    }
    return id;
  }
  if (name) {
    return resolveAppId(name, sessionId);
  }
  throw new Error('Either id or name must be provided');
}

export async function resolveAppId(
  name: string,
  sessionId?: string
): Promise<string> {
  const query = name.toLowerCase().trim();
  if (!query) {
    throw new Error('App name must not be empty or whitespace.');
  }
  const apps = await getInstalledApps(sessionId);

  type ScoredApp = { packageName: string; score: number };
  const scored: ScoredApp[] = [];

  for (const app of apps) {
    const displayName = (app.appName ?? '').toLowerCase();
    const pkg = app.packageName.toLowerCase();
    const pkgLastSegment = pkg.split('.').at(-1) ?? pkg;

    if (displayName === query) {
      scored.push({ packageName: app.packageName, score: 100 });
    } else if (displayName.startsWith(query)) {
      scored.push({ packageName: app.packageName, score: 80 });
    } else if (displayName.includes(query)) {
      scored.push({ packageName: app.packageName, score: 60 });
    } else if (pkgLastSegment.includes(query)) {
      scored.push({ packageName: app.packageName, score: 40 });
    } else if (pkg.includes(query)) {
      scored.push({ packageName: app.packageName, score: 20 });
    }
  }

  if (scored.length === 0) {
    throw new Error(
      `No installed app matched the name "${name}". Use "appium_app list" action to see available apps.`
    );
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0].packageName;
}
