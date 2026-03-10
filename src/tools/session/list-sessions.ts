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

      const sessionSummary = sessions
        .map(
          (session, index) =>
            `${index + 1}. sessionId=${session.sessionId}${session.isActive ? ' (active)' : ''}\n   platform=${session.platform || 'N/A'}, automationName=${session.automationName || 'N/A'}, deviceName=${session.deviceName || 'N/A'}, currentContext=${session.currentContext || 'N/A'}`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Active session: ${activeSessionId || 'N/A'}\nSelect with: select_session { "sessionId": "..." }\n\nSessions:\n${sessionSummary}`,
          },
        ],
      };
    },
  });
}
