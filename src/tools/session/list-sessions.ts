import { z } from 'zod';
import { getSessionId, listSessions } from '../../session-store.js';

export default function listSessionsTool(server: any): void {
  server.addTool({
    name: 'list_sessions',
    description:
      'List all active Appium sessions managed by this MCP server, including active flag and current context.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<any> => {
      const sessions = listSessions();
      const activeSessionId = getSessionId();

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No active sessions found.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Active session: ${activeSessionId || 'N/A'}\nSessions:\n${JSON.stringify(sessions, null, 2)}`,
          },
        ],
      };
    },
  });
}
