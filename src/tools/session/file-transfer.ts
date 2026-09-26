import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {execute} from '../../command.js';
import {getPlatformName} from '../../session-store.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';

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
    typeof (result as {value: unknown}).value === 'string'
  ) {
    return (result as {value: string}).value;
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
    action: z.enum(['push', 'pull']).describe('push uploads a file to device; pull downloads from device.'),
    remotePath: z.string().min(1).describe(remotePathDescription),
    payloadBase64: z.string().optional().describe('Required when action=push. Ignored when action=pull.'),
    sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
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
      _context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const {driver} = resolved;

      try {
        if (args.action === 'push') {
          if (!args.payloadBase64) {
            return errorResult('payloadBase64 is required when action is push');
          }

          await execute(driver, 'mobile: pushFile', {
            remotePath: args.remotePath,
            payload: args.payloadBase64,
          });

          return textResult(`Successfully pushed file to device path: ${args.remotePath}`);
        }

        const raw = await execute(driver, 'mobile: pullFile', {
          remotePath: args.remotePath,
        });

        const base64 = normalizePullResult(raw);
        return textResult(
          JSON.stringify({
            remotePath: args.remotePath,
            platform: getPlatformName(driver),
            contentBase64: base64,
          }),
        );
      } catch (err: unknown) {
        return errorResult(`Failed file action ${args.action}. err: ${toolErrorMessage(err)}`);
      }
    },
  });
}
