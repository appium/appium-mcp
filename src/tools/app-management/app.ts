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

const sessionId = z
  .string()
  .optional()
  .describe('Session ID to target. If omitted, uses the active session.');

const appIdFields = {
  id: z
    .string()
    .optional()
    .describe(
      'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name. Required if name is not provided.'
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Human-readable app name (e.g. "Spotify"). Used to resolve the app id when id is not provided. Required if id is not provided.'
    ),
};

const schema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('activate').describe('Bring an app to the foreground.'),
      ...appIdFields,
      sessionId,
    }),
    z.object({
      action: z.literal('terminate').describe('Stop a running app.'),
      ...appIdFields,
      sessionId,
    }),
    z.object({
      action: z.literal('install').describe('Install an app from a file path.'),
      path: z.string().describe('Path to the app file to install.'),
      sessionId,
    }),
    z.object({
      action: z.literal('uninstall').describe('Remove an app from the device.'),
      ...appIdFields,
      keepData: z
        .boolean()
        .optional()
        .describe('Keep app data and cache after uninstall. Android only.'),
      sessionId,
    }),
    z.object({
      action: z
        .literal('list')
        .describe('List all installed apps on the device.'),
      applicationType: z
        .enum(['User', 'System'])
        .optional()
        .describe('iOS only: filter by "User" (default) or "System" apps.'),
      sessionId,
    }),
    z.object({
      action: z
        .literal('is_installed')
        .describe('Check whether an app is installed.'),
      ...appIdFields,
      sessionId,
    }),
    z.object({
      action: z
        .literal('query_state')
        .describe(
          'Get app state: 0=not installed, 1=not running, 2=background suspended, 3=background, 4=foreground.'
        ),
      ...appIdFields,
      sessionId,
    }),
    z.object({
      action: z
        .literal('background')
        .describe(
          'Send the current foreground app to the background, then return it after a delay.'
        ),
      seconds: z
        .number()
        .min(-1)
        .max(86400)
        .optional()
        .describe(
          `Seconds to keep the app in the background. Defaults to ${DEFAULT_BACKGROUND_SECONDS}. Use -1 to stay in background without auto-resuming.`
        ),
      sessionId,
    }),
    z.object({
      action: z
        .literal('clear')
        .describe(
          'Clear all user data and cache without uninstalling. Android: stop the app first. iOS: Simulator only.'
        ),
      ...appIdFields,
      sessionId,
    }),
    z.object({
      action: z
        .literal('deep_link')
        .describe('Open a deep link URL with the default or specified app.'),
      url: z
        .string()
        .describe(
          'Deep link URL to open (e.g. https://example.com, myapp://path).'
        ),
      id: z
        .string()
        .optional()
        .describe(
          'App identifier (bundle ID for iOS, package for Android). Optional.'
        ),
      name: z
        .string()
        .optional()
        .describe(
          'Human-readable app name. Used to resolve the app id when id is not provided.'
        ),
      waitForLaunch: z
        .boolean()
        .optional()
        .describe(
          'Android only. If false, ADB does not wait for the activity to return. Defaults to true.'
        ),
      sessionId,
    }),
  ]);

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
        const driver = getDriver(sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }
        return install(driver, args.path, sessionId);
      }

      if (action === 'deep_link') {
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
      const id = await resolveId(
        (args as any).id,
        (args as any).name,
        sessionId
      );

      if (action === 'activate') {
        return activate(driver, id);
      }
      if (action === 'terminate') {
        return terminate(driver, id);
      }
      if (action === 'uninstall') {
        return uninstall(driver, id, (args as any).keepData, sessionId);
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
