import {setActiveSession} from '../../session-store.js';
import {textResult, errorResult} from '../tool-response.js';

export async function selectSessionAction(sessionId: string): Promise<any> {
  const updated = setActiveSession(sessionId);
  if (!updated) {
    return errorResult(`Session ${sessionId} was not found. Use appium_session_management (action=list) for IDs.`);
  }
  return textResult(`Session ${sessionId} is now active.`);
}
