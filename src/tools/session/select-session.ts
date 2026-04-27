import { setActiveSession } from '../../session-store.js';
import { textResult, errorResult } from '../tool-response.js';

export async function selectSessionAction(sessionId: string): Promise<any> {
  const updated = setActiveSession(sessionId);
  if (!updated) {
    return errorResult(
      `Session ${sessionId} was not found. Use sessions(action=list) to see available IDs.`
    );
  }
  return textResult(`Session ${sessionId} is now active.`);
}
