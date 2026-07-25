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
import { errorResult, toolErrorMessage } from '../tool-response.js';

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
      'App action. install requires path; deep_link requires url; list/background need no id. ' +
        'Other actions require id or name. query_state returns WebDriver states 0–4.'
    ),
  id: z
    .string()
    .optional()
    .describe('Android package or iOS bundle ID; preferred over name.'),
  name: z
    .string()
    .optional()
    .describe('App name resolved to an ID; alternative to id.'),
  path: z.string().optional().describe('App file path; required for install.'),
  keepData: z
    .boolean()
    .optional()
    .describe('Android uninstall: retain data/cache.'),
  applicationType: z
    .enum(['User', 'System'])
    .optional()
    .describe('iOS list filter; default User.'),
  seconds: z
    .number()
    .min(-1)
    .max(86400)
    .optional()
    .describe(
      `background seconds; default ${DEFAULT_BACKGROUND_SECONDS}; -1 stays backgrounded.`
    ),
  url: z.string().optional().describe('URL; required for deep_link.'),
  waitForLaunch: z
    .boolean()
    .optional()
    .describe('Android deep_link: wait for launch; default true.'),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export default function app(server: FastMCP): void {
  server.addTool({
    name: 'appium_app_lifecycle',
    description: `Manage app lifecycle: ${APP_ACTIONS.join(', ')}.`,
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
            return errorResult(
              `deep_link: failed to resolve app by name: ${toolErrorMessage(err)}`
            );
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
        return errorResult(
          `${action}: failed to resolve app id: ${toolErrorMessage(err)}`
        );
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
