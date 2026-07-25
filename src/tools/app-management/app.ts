import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {errorResult, toolErrorMessage} from '../tool-response.js';
import {activate} from './activate-app.js';
import {background, DEFAULT_BACKGROUND_SECONDS} from './background-app.js';
import {clear} from './clear-app.js';
import {deepLink} from './deep-link.js';
import {install} from './install-app.js';
import {isInstalled} from './is-app-installed.js';
import {list} from './list-apps.js';
import {queryState} from './query-app-state.js';
import {resolveAppId, resolveId} from './resolve-app-id.js';
import {terminate} from './terminate-app.js';
import {uninstall} from './uninstall-app.js';

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
] as const;

export type AppAction = (typeof APP_ACTIONS)[number];

const schema = z.object({
  action: z
    .enum(APP_ACTIONS)
    .describe(
      'activate: foreground app; terminate: stop app; is_installed: check installation; ' +
        'clear: clear app data without uninstalling (all require id or name). ' +
        'install: requires path. uninstall: requires id/name; Android keepData is optional. ' +
        'list: optional iOS applicationType. ' +
        'query_state: get state 0=not installed,1=not running,2=background suspended,3=background,4=foreground (requires id or name). ' +
        'background: send foreground app to background; optional seconds (default 5). ' +
        'deep_link: requires url; id/name is optional.',
    ),
  id: z.string().optional().describe('Android package or iOS bundle ID; takes precedence over name.'),
  name: z.string().optional().describe('Human-readable app name resolved to an ID; alternative to id.'),
  path: z.string().optional().describe('App file path; required for install.'),
  keepData: z.boolean().optional().describe('Android uninstall: preserve app data and cache.'),
  applicationType: z.enum(['User', 'System']).optional().describe('iOS list filter: User (default) or System.'),
  seconds: z
    .number()
    .min(-1)
    .max(86400)
    .optional()
    .describe(`Background duration; default ${DEFAULT_BACKGROUND_SECONDS}. Use -1 to remain in background.`),
  url: z.string().optional().describe('URL for deep_link (e.g. https://example.com or myapp://path).'),
  waitForLaunch: z.boolean().optional().describe('Android deep_link: wait for the activity to return; default true.'),
  sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
});

export default function app(server: FastMCP): void {
  server.addTool({
    name: 'appium_app_lifecycle',
    description: 'Manage app lifecycle, installation, state, data, and deep links.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => {
      const {action, sessionId} = args;

      if (action === 'list') {
        return list(args.applicationType, sessionId);
      }
      if (action === 'background') {
        return background(args.seconds ?? DEFAULT_BACKGROUND_SECONDS, sessionId);
      }
      if (action === 'install') {
        if (!args.path) {
          return errorResult('path is required for install');
        }
        return install(args.path, sessionId);
      }

      if (action === 'deep_link') {
        if (!args.url) {
          return errorResult('url is required for deep_link');
        }
        let appId: string | undefined;
        if (args.id !== undefined) {
          appId = args.id;
        } else if (args.name) {
          try {
            appId = await resolveAppId(args.name, sessionId);
          } catch (err: unknown) {
            return errorResult(`deep_link: failed to resolve app by name: ${toolErrorMessage(err)}`);
          }
        } else {
          appId = undefined;
        }
        return deepLink(args.url, appId, args.waitForLaunch, sessionId);
      }

      // activate, terminate, uninstall, is_installed, query_state, clear — all require id or name
      let id: string;
      try {
        id = await resolveId(args.id, args.name, sessionId);
      } catch (err: unknown) {
        return errorResult(`${action}: failed to resolve app id: ${toolErrorMessage(err)}`);
      }

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
      return errorResult(`Unknown action: ${action}`);
    },
  });
}
