import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

/**
 * Normalize the return value of mobile: pullFile (driver may return a string
 * or a wrapped value depending on client/driver).
 */
function normalizePullResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (
    result &&
    typeof result === 'object' &&
    'value' in result &&
    typeof (result as { value: unknown }).value === 'string'
  ) {
    return (result as { value: string }).value;
  }
  return String(result ?? '');
}

const remotePathDescription =
  'Device path: absolute Android path (e.g. /sdcard/Download/a.txt) or XCUITest form (e.g. @com.example.app:documents/a.txt).';

export default function fileTransfer(server: FastMCP): void {
  const schema = z.object({
    action: z
      .enum(['push', 'pull'])
      .describe('push uploads; pull returns base64.'),
    remotePath: z.string().min(1).describe(remotePathDescription),
    payloadBase64: z
      .string()
      .optional()
      .describe('Base64 payload required for push.'),
    sessionId: z
      .string()
      .optional()
      .describe('Target session; defaults to active.'),
  });

  server.addTool({
    name: 'appium_mobile_file',
    description: 'Push/pull device files; pull returns contentBase64.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const platform = getPlatformName(driver);

        if (args.action === 'push') {
          if (!args.payloadBase64) {
            return errorResult('payloadBase64 is required when action is push');
          }

          if (platform === PLATFORM.android) {
            await execute(driver, 'mobile: pushFile', {
              path: args.remotePath,
              data: args.payloadBase64,
            });
          } else if (platform === PLATFORM.ios) {
            await execute(driver, 'mobile: pushFile', {
              remotePath: args.remotePath,
              payload: args.payloadBase64,
            });
          } else {
            return errorResult(
              `Unsupported platform: ${platform}. Only Android and iOS are supported.`
            );
          }

          return textResult(
            `Successfully pushed file to device path: ${args.remotePath}`
          );
        }

        let raw: unknown;
        if (platform === PLATFORM.android) {
          raw = await execute(driver, 'mobile: pullFile', {
            path: args.remotePath,
          });
        } else if (platform === PLATFORM.ios) {
          raw = await execute(driver, 'mobile: pullFile', {
            remotePath: args.remotePath,
          });
        } else {
          return errorResult(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        const base64 = normalizePullResult(raw);
        return textResult(
          JSON.stringify({
            remotePath: args.remotePath,
            platform,
            contentBase64: base64,
          })
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed file action ${args.action}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
