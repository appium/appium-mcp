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

const payloadDescription =
  'File contents encoded as Base64 (raw base64 only; do not include a data: URL prefix).';

/**
 * Push a file from the host (MCP client) to the device via `mobile: pushFile`.
 *
 * - Android: `{ path, data }` per UiAutomator2 / legacy JSONWP push_file.
 * - iOS: `{ remotePath, payload }` per XCUITest execute-methods reference.
 */
export function pushFile(server: FastMCP): void {
  const schema = z.object({
    remotePath: z.string().min(1).describe(remotePathDescription),
    payloadBase64: z.string().min(1).describe(payloadDescription),
  });

  server.addTool({
    name: 'appium_mobile_push_file',
    description:
      'Push a file to the device using the Appium `mobile: pushFile` extension. ' +
      'Android uses `path` + `data` (base64). iOS uses `remotePath` + `payload` (base64). ' +
      'Path semantics on iOS follow the XCUITest file transfer guide (app containers, documents, simulator paths). ' +
      'Large payloads produce large requests; avoid pushing huge files through MCP.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to push file. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}

/**
 * Pull a file from the device via `mobile: pullFile`. Returns Base64-encoded content in the response text.
 */
export function pullFile(server: FastMCP): void {
  const schema = z.object({
    remotePath: z.string().min(1).describe(remotePathDescription),
  });

  server.addTool({
    name: 'appium_mobile_pull_file',
    description:
      'Pull a file from the device using the Appium `mobile: pullFile` extension. ' +
      'Returns Base64-encoded file content in the response text. ' +
      'Android uses parameter `path`; iOS uses `remotePath` with the same path formats as push. ' +
      'Very large files may produce very large responses; prefer downloading or streaming outside MCP for big binaries.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
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
              text: `Failed to pull file. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
