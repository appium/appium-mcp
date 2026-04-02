import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

/** When `seconds` is omitted, MCP clients often send `{}` — a middle ground so the transition is visible without a long wait. */
export const DEFAULT_BACKGROUND_SECONDS = 5;

export default function backgroundApp(server: FastMCP): void {
  const schema = z.object({
    seconds: z
      .number()
      .min(-1)
      .max(86400)
      .default(DEFAULT_BACKGROUND_SECONDS)
      .describe(
        `Optional. How long to keep the current app in the background before returning it to the foreground (whole seconds). ` +
          `Defaults to ${DEFAULT_BACKGROUND_SECONDS} if omitted. ` +
          `Larger values make the transition easier to see. Use -1 to leave the app in the background without auto-resuming (driver-specific).`
      ),
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_background_app',
    description: `Send the current foreground app to the background for a duration (default ${DEFAULT_BACKGROUND_SECONDS}s if not specified), then return to the foreground unless using driver-specific stay-in-background behavior. Uses the Appium mobile: backgroundApp execute method (UiAutomator2 and XCUITest).`,
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const { seconds } = args;
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await execute(driver, 'mobile: backgroundApp', { seconds });
        const resumeHint =
          seconds < 0
            ? 'The app should stay in the background until you bring it back (e.g. appium_activate_app).'
            : 'The app is sent to the background, then brought back automatically after the wait.';
        return {
          content: [
            {
              type: 'text',
              text:
                `Background completed (${seconds}s). ${resumeHint}\n\n` +
                `Tips if you saw little or no change: (1) Short positive durations (e.g. 2s) are easy to miss—try 8–15 seconds to see the home/recents screen clearly. ` +
                `(2) The foreground app must be the one you expect—use appium_activate_app with the package/bundle id first if needed. ` +
                `(3) Some OEMs minimize animation; use appium_screenshot before and after to verify.`,
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to background app. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
