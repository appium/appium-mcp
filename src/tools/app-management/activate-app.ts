import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { executeAcrossSessions } from '../../broadcast.js';
import { activateApp as _activateApp } from '../../command.js';
import {
  resolveSessionTargetFromArgs,
  sessionTargetSchema,
} from '../session/targeting.js';

export default function activateApp(server: FastMCP): void {
  const activateAppSchema = z.intersection(
    z.object({
      id: z.string().describe('The app id'),
    }),
    sessionTargetSchema
  );

  server.addTool({
    name: 'appium_activate_app',
    description:
      'Activate app by id. Can target the active session, one session, a session group, or all sessions.',
    parameters: activateAppSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof activateAppSchema>,
      _context: any
    ): Promise<any> => {
      const target = resolveSessionTargetFromArgs(args);
      const result = await executeAcrossSessions(target, async (session) => {
        await _activateApp(session.driver, args.id);
        return `Activated ${args.id}`;
      });

      const summary =
        result.total === 1
          ? result.results[0].status === 'success'
            ? `App ${args.id} activated correctly.`
            : `Error activating the app ${args.id}: ${result.results[0].error}`
          : `App activation finished for ${result.total} session(s). ${result.succeeded} succeeded, ${result.failed} failed.`;

      const details = result.results
        .map(
          (item, index) =>
            `${index + 1}. sessionId=${item.sessionId}, device=${item.deviceName || 'Unknown'}, status=${item.status}${item.error ? `, error=${item.error}` : ''}`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text:
              result.total === 1
                ? summary
                : `${summary}\n\nResults:\n${details}`,
          },
        ],
        ...(result.failed > 0 ? { isError: true } : {}),
      };
    },
  });
}
