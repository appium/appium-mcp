import { getDriver, getSessionId, listSessions } from '../../session-store.js';
import { textResult } from '../tool-response.js';

export async function listSessionsAction(): Promise<any> {
  const sessions = listSessions();
  const activeSessionId = getSessionId();

  if (sessions.length === 0) {
    return textResult('No active sessions found.');
  }

  const sessionSummary = sessions
    .map((session, index) => {
      const driver = getDriver(session.sessionId);
      const rawClassName = driver?.constructor?.name;
      return `${index + 1}. sessionId=${session.sessionId}${session.isActive ? ' (active)' : ''}\n   driverInstance=${rawClassName}, ownership=${session.ownership}, platform=${session.platform}, automationName=${session.automationName}, deviceName=${session.deviceName}, currentContext=${session.currentContext}`;
    })
    .join('\n');

  return textResult(
    `Active session: ${activeSessionId || 'Unknown'}\nSelect with: action=select { "sessionId": "..." }\n\nSessions:\n${sessionSummary}`
  );
}
