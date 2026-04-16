import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
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
import {
  iosPermissionStateSchema,
  getPermissions,
  updatePermissions,
  resetPermissions,
} from './permissions.js';

const APP_ACTIONS = [
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
  'permissions',
] as const;

export type AppAction = (typeof APP_ACTIONS)[number];

const schema = z.object({
  action: z
    .enum(APP_ACTIONS)
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
        'deep_link: open a URL with an app (requires url; optional id or name). ' +
        'permissions: manage app permissions — use permissionAction (get/update/reset) to select the operation.'
    ),
  id: z
    .string()
    .optional()
    .describe(
      'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name. Required for: activate, terminate, uninstall, is_installed, query_state, clear, and permissions.'
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Human-readable app name (e.g. "Spotify"). Used to resolve the app id. Required (as alternative to id) for: activate, terminate, uninstall, is_installed, query_state, clear. and permissions.'
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
  permissionAction: z
    .enum(['get', 'update', 'reset'])
    .optional()
    .describe(
      'Used with action=permissions. ' +
        'get: Android lists runtime permissions (optional id or name); iOS reads one service state (requires id or name + service string). ' +
        'update: Android grant/revoke permissions (requires permissions; optional id or name); iOS sets privacy access map (requires id or name + access). ' +
        'reset: iOS only — resets a privacy service for the app under test (requires service).'
    ),
  permissionFilter: z
    .enum(['denied', 'granted', 'requested'])
    .optional()
    .describe(
      'Android only permissions get: which bucket to return. Defaults to requested per UiAutomator2.'
    ),
  service: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'iOS only. Permissions get: privacy service name (e.g. camera, microphone, photos). ' +
        'iOS only. Permissions reset: service name or numeric XCUIProtectedResource id.'
    ),
  permissions: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Android only. Permissions update: permission name(s), `all` (with pm target), or appops names. Required for Android update.'
    ),
  permissionChangeAction: z
    .string()
    .optional()
    .describe(
      'Android only. Permissions update: for pm target grant (default) or revoke; for appops allow, deny, ignore, default.'
    ),
  target: z
    .enum(['pm', 'appops'])
    .optional()
    .describe('Android only. Permissions update: pm (default) or appops.'),
  access: z
    .record(z.string(), iosPermissionStateSchema)
    .optional()
    .describe(
      'iOS only. Permissions update: map of access rule → yes|no|unset|limited. Required for iOS update.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function app(server: FastMCP): void {
  server.addTool({
    name: 'appium_app',
    description: `Manage apps on the device. Use the action parameter to choose what to do: ${APP_ACTIONS.join(', ')}.`,
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
        return background(
          args.seconds ?? DEFAULT_BACKGROUND_SECONDS,
          sessionId
        );
      }
      if (action === 'install') {
        if (!args.path) {
          return {
            content: [{ type: 'text', text: 'path is required for install' }],
          };
        }
        return install(args.path, sessionId);
      }

      if (action === 'deep_link') {
        if (!args.url) {
          return {
            content: [{ type: 'text', text: 'url is required for deep_link' }],
          };
        }
        const appId =
          args.id ??
          (args.name ? await resolveAppId(args.name, sessionId) : undefined);
        return deepLink(args.url, appId, args.waitForLaunch, sessionId);
      }

      if (action === 'permissions') {
        const appId =
          args.id ??
          (args.name ? await resolveAppId(args.name, sessionId) : undefined);
        if (args.permissionAction === 'get') {
          return getPermissions(
            {
              appId,
              permissionFilter: args.permissionFilter,
              service: args.service,
            },
            sessionId
          );
        }
        if (args.permissionAction === 'update') {
          return updatePermissions(
            {
              appId,
              permissions: args.permissions,
              permissionChangeAction: args.permissionChangeAction,
              target: args.target,
              access: args.access,
            },
            sessionId
          );
        }
        if (args.permissionAction === 'reset') {
          return resetPermissions({ service: args.service }, sessionId);
        }
        return {
          content: [
            {
              type: 'text',
              text: 'permissionAction (get/update/reset) is required for action=permissions',
            },
          ],
        };
      }

      // activate, terminate, uninstall, is_installed, query_state, clear — all require id or name
      const id = await resolveId(args.id, args.name, sessionId);

      if (action === 'activate') {
        return activate(id, sessionId);
      }
      if (action === 'terminate') {
        return terminate(id, sessionId);
      }
      if (action === 'uninstall') {
        return uninstall(id, args.keepData, sessionId);
      }
      if (action === 'is_installed') {
        return isInstalled(id, sessionId);
      }
      if (action === 'query_state') {
        return queryState(id, sessionId);
      }
      if (action === 'clear') {
        return clear(id, sessionId);
      }
      return {
        content: [{ type: 'text', text: `Unknown action: ${action}` }],
      };
    },
  });
}
