import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { queryAppState as _queryAppState } from '../../command.js';
import { resolveId } from './resolve-app-id.js';

const APP_STATE_LABELS: Record<number, string> = {
  0: 'not installed',
  1: 'not running',
  2: 'running in background (suspended)',
  3: 'running in background',
  4: 'running in foreground',
};

export default function queryAppState(server: FastMCP): void {
  const schema = z
    .object({
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
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
    })
    .refine((args) => args.id || args.name, {
      message: 'Either id or name must be provided',
    });

  server.addTool({
    name: 'appium_query_app_state',
    description:
      'Query the current state of an app. Either id or name must be provided. Returns a numeric state: 0=not installed, 1=not running, 2=background (suspended), 3=background, 4=foreground.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>) => {
      const { sessionId } = args;
      const driver = getDriver(sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      const id = await resolveId(args.id, args.name, sessionId);
      try {
        const state = await _queryAppState(driver, id);
        const label = APP_STATE_LABELS[state] ?? 'unknown';
        return {
          content: [
            { type: 'text', text: `App "${id}" state: ${state} (${label})` },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to query app state for "${id}": ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
