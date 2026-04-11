import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

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
  'Path to the file on the device. ' +
  'Android (UiAutomator2): use an absolute path (e.g. /data/local/tmp/foo.txt or /sdcard/Download/foo.txt). ' +
  'iOS (XCUITest): use the formats described in the Appium XCUITest file transfer guide ' +
  '(e.g. @com.example.app:documents/file.txt or simulator-relative paths).';

export default function fileTransfer(server: FastMCP): void {
  const schema = z.object({
    action: z
      .enum(['push', 'pull'])
      .describe('push uploads a file to device; pull downloads from device.'),
    remotePath: z.string().min(1).describe(remotePathDescription),
    payloadBase64: z
      .string()
      .optional()
      .describe('Required when action=push. Ignored when action=pull.'),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_file',
    description:
      'Push or pull a file using Appium mobile extensions. action=push uses payloadBase64, action=pull returns contentBase64.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);

        if (args.action === 'push') {
          if (!args.payloadBase64) {
            throw new Error('payloadBase64 is required when action is push');
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
            throw new Error(
              `Unsupported platform: ${platform}. Only Android and iOS are supported.`
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: `Successfully pushed file to device path: ${args.remotePath}`,
              },
            ],
          };
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
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        const base64 = normalizePullResult(raw);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                remotePath: args.remotePath,
                platform,
                contentBase64: base64,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed file action ${args.action}. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
