import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { resolveAppId, resolveId } from './resolve-app-id.js';
import { activate } from './activate-app.js';
import { terminate } from './terminate-app.js';
import { install } from './install-app.js';
import { uninstall } from './uninstall-app.js';
import { list } from './list-apps.js';
import { isInstalled } from './is-app-installed.js';
import { queryState } from './query-app-state.js';
import { background, DEFAULT_BACKGROUND_SECONDS } from './background-app.js';
import { clear } from './clear-app.js';
import { deepLink } from './deep-link.js';

const schema = z.object({
  action: z
    .enum([
      'activate',
      'terminate',
      'install',
      'uninstall',
      'list',
      'is_installed',
      'query_state',
      'background',
      'clear',
      'deep_link',
    ])
    .describe(
      'Action to perform. ' +
        'activate: bring app to foreground (requires id or name). ' +
        'terminate: stop a running app (requires id or name). ' +
        'install: install from file path (requires path). ' +
        'uninstall: remove from device (requires id or name; optional keepData for Android). ' +
        'list: list installed apps (optional applicationType for iOS). ' +
        'is_installed: check if app is installed (requires id or name). ' +
        'query_state: get state 0=not installed,1=not running,2=background suspended,3=background,4=foreground (requires id or name). ' +
        'background: send foreground app to background (optional seconds, default 5). ' +
        'clear: clear app data without uninstalling (requires id or name). ' +
        'deep_link: open a URL with an app (requires url; optional id or name).'
    ),
  id: z
    .string()
    .optional()
    .describe(
      'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name. Required for: activate, terminate, uninstall, is_installed, query_state, clear.'
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Human-readable app name (e.g. "Spotify"). Used to resolve the app id. Required (as alternative to id) for: activate, terminate, uninstall, is_installed, query_state, clear.'
    ),
  path: z
    .string()
    .optional()
    .describe('Path to the app file to install. Required for: install.'),
  keepData: z
    .boolean()
    .optional()
    .describe(
      'Keep app data and cache after uninstall. Android only. Used with: uninstall.'
    ),
  applicationType: z
    .enum(['User', 'System'])
    .optional()
    .describe(
      'iOS only: filter by "User" (default) or "System" apps. Used with: list.'
    ),
  seconds: z
    .number()
    .min(-1)
    .max(86400)
    .optional()
    .describe(
      `Seconds to keep the app in the background. Defaults to ${DEFAULT_BACKGROUND_SECONDS}. Use -1 to stay in background without auto-resuming. Used with: background.`
    ),
  url: z
    .string()
    .optional()
    .describe(
      'Deep link URL to open (e.g. https://example.com, myapp://path). Required for: deep_link.'
    ),
  waitForLaunch: z
    .boolean()
    .optional()
    .describe(
      'Android only. If false, ADB does not wait for the activity to return. Defaults to true. Used with: deep_link.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function app(server: FastMCP): void {
  server.addTool({
    name: 'appium_app',
    description:
      'Manage apps on the device. Use the action parameter to choose what to do: ' +
      'activate, terminate, install, uninstall, list, is_installed, query_state, background, clear, deep_link.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const { action, sessionId } = args;

      if (action === 'list') {
        return list(args.applicationType, sessionId);
      }

      if (action === 'background') {
        const driver = getDriver(sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }
        return background(driver, args.seconds ?? DEFAULT_BACKGROUND_SECONDS);
      }

      if (action === 'install') {
        if (!args.path) {
          throw new Error('path is required for install');
        }
        const driver = getDriver(sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }
        return install(driver, args.path, sessionId);
      }

      if (action === 'deep_link') {
        if (!args.url) {
          throw new Error('url is required for deep_link');
        }
        const driver = getDriver(sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }
        let appId = args.id;
        if (!appId && args.name) {
          appId = await resolveAppId(args.name, sessionId);
        }
        return deepLink(driver, args.url, appId, args.waitForLaunch);
      }

      // activate, terminate, uninstall, is_installed, query_state, clear — all require id or name
      const driver = getDriver(sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      const id = await resolveId(args.id, args.name, sessionId);

      if (action === 'activate') {
        return activate(driver, id);
      }
      if (action === 'terminate') {
        return terminate(driver, id);
      }
      if (action === 'uninstall') {
        return uninstall(driver, id, args.keepData, sessionId);
      }
      if (action === 'is_installed') {
        return isInstalled(driver, id);
      }
      if (action === 'query_state') {
        return queryState(driver, id);
      }
      if (action === 'clear') {
        return clear(driver, id);
      }
      throw new Error(`Unknown action: ${action}`);
    },
  });
}
