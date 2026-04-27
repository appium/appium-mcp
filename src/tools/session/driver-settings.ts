import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getSessionDriverSettings,
  updateSessionDriverSettings,
} from '../../command.js';
import {
  errorResult,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';

const schema = z.object({
  action: z
    .enum(['get', 'update'])
    .describe(
      'get: read current Appium driver session settings (timeouts, selector waits, flags). ' +
        'update: merge a settings map into the session (requires settings).'
    ),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Required when action is update. Driver-specific keys (e.g. Android UiAutomator2: ' +
        'waitForIdleTimeout, waitForSelectorTimeout, ignoreUnimportantViews; iOS XCUITest has its own set). ' +
        'Use action=get first to inspect current values.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

type DriverSettingsArgs = z.infer<typeof schema>;

async function handleGet(sessionId?: string): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  const settings = await getSessionDriverSettings(driver);
  return textResult(JSON.stringify(settings, null, 2));
}

async function handleUpdate(
  sessionId: string | undefined,
  settings: Record<string, unknown>
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  await updateSessionDriverSettings(driver, settings);
  return textResult('Successfully updated driver settings.');
}

export default function driverSettings(server: FastMCP): void {
  server.addTool({
    name: 'appium_driver_settings',
    description:
      'Read or update Appium driver session settings (e.g. idle timeouts, selector waits). ' +
      'Use action=get to return JSON settings; action=update merges a map into the session. ' +
      'Works for embedded UiAutomator2/XCUITest sessions and remote WebDriver clients that support Appium settings.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: DriverSettingsArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        switch (args.action) {
          case 'get':
            return await handleGet(args.sessionId);
          case 'update': {
            if (args.settings === undefined) {
              return errorResult('settings is required for update action');
            }
            return await handleUpdate(args.sessionId, args.settings);
          }
        }
      } catch (err: unknown) {
        return errorResult(
          `Failed to ${args.action} driver settings. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
