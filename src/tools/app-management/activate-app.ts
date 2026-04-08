import { FastMCP } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { z } from 'zod';
import { activateApp as _activateApp } from '../../command.js';
import { resolveAppId } from './resolve-app-id.js';

export default function activateApp(server: FastMCP): void {
  const activateAppSchema = z.object({
    id: z
      .string()
      .optional()
      .describe(
        'The app id (package name for Android, bundle ID for iOS). Takes precedence over name.'
      ),
    name: z
      .string()
      .optional()
      .describe(
        'Human-readable app name (e.g. "Spotify"). Used to resolve the app id when id is not provided.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_activate_app',
    description: 'Activate app by id or human-readable name',
    parameters: activateAppSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof activateAppSchema>,
      _context: any
    ): Promise<any> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      let appId = args.id;
      if (!appId) {
        if (!args.name) {
          throw new Error('Either id or name must be provided');
        }
        appId = await resolveAppId(args.name, args.sessionId);
      }

      try {
        await _activateApp(driver, appId);
        return {
          content: [
            {
              type: 'text',
              text: `App ${appId} activated correctly.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error activating the app ${appId}: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
