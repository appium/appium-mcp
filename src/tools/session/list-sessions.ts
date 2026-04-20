import { z } from 'zod';
import { getDriver, getSessionId, listSessions } from '../../session-store.js';
import { textResult } from '../tool-response.js';

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
        return textResult('No active sessions found.');
      }

      const sessionSummary = sessions
        .map((session, index) => {
          const driver = getDriver(session.sessionId);
          const rawClassName = driver?.constructor?.name;
          return `${index + 1}. sessionId=${session.sessionId}${session.isActive ? ' (active)' : ''}\n   driverInstance=${rawClassName}, platform=${session.platform}, automationName=${session.automationName}, deviceName=${session.deviceName}, currentContext=${session.currentContext}`;
        })
        .join('\n');

      return textResult(
        `Active session: ${activeSessionId || 'Unknown'}\nSelect with: select_session { "sessionId": "..." }\n\nSessions:\n${sessionSummary}`
      );
    },
  });
}
