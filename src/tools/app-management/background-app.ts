import type { ContentResult } from 'fastmcp';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export const DEFAULT_BACKGROUND_SECONDS = 5;

export async function background(
  seconds: number,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  try {
    await execute(driver, 'mobile: backgroundApp', { seconds });
    const resumeHint =
      seconds < 0
        ? 'The app should stay in the background until you bring it back (e.g. action=activate).'
        : 'The app is sent to the background, then brought back automatically after the wait.';
    return textResult(
      `Background completed (${seconds}s). ${resumeHint}\n\n` +
        `Tips if you saw little or no change: (1) Short positive durations (e.g. 2s) are easy to miss—try 8–15 seconds to see the home/recents screen clearly. ` +
        `(2) The foreground app must be the one you expect—use action=activate with the package/bundle id first if needed. ` +
        `(3) Some OEMs minimize animation; use appium_screenshot before and after to verify.`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to background app. Error: ${toolErrorMessage(err)}`
    );
  }
}
