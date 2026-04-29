import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getClipboard, setClipboard } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const schema = z.object({
  action: z
    .enum(['get', 'set'])
    .describe(
      'get: read device clipboard as plain text. set: write plain text to the clipboard.'
    ),
  content: z
    .string()
    .optional()
    .describe(
      'Required when action is set. Plain text to put on the clipboard.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

type ClipboardArgs = z.infer<typeof schema>;

async function handleGet(sessionId?: string): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  const text = await getClipboard(driver);
  if (!text) {
    return textResult('Clipboard is empty.');
  }
  return textResult(`Clipboard content: ${text}`);
}

async function handleSet(
  sessionId: string | undefined,
  content: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  await setClipboard(driver, content);
  return textResult(`Successfully set clipboard content to: ${content}`);
}

export default function clipboard(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_clipboard',
    description:
      'Read or set the device clipboard as plain text (Android UiAutomator2 / iOS XCUITest). ' +
      'action=get returns current text; action=set requires content.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: ClipboardArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        switch (args.action) {
          case 'get':
            return await handleGet(args.sessionId);
          case 'set': {
            if (args.content === undefined) {
              return errorResult('content is required for set action');
            }
            return await handleSet(args.sessionId, args.content);
          }
        }
      } catch (err: unknown) {
        return errorResult(
          `Failed to ${args.action} clipboard. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
