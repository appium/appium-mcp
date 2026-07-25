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
    .describe('get reads; update requires settings and merges them.'),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Driver-specific settings map; inspect with get first.'),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

type DriverSettingsArgs = z.infer<typeof schema>;

export default function driverSettings(server: FastMCP): void {
  server.addTool({
    name: 'appium_driver_settings',
    description:
      'Get or update Appium driver settings for embedded or supporting remote sessions.',
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

async function handleGet(sessionId?: string): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
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
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  await updateSessionDriverSettings(driver, settings);
  return textResult('Successfully updated driver settings.');
}
