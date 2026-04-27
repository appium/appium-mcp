import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getClipboard, setClipboard } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

/**
 * Register clipboard read/write tools.
 *
 * - appium_get_clipboard: reads the current clipboard content as plain text
 * - appium_set_clipboard: writes plain text to the clipboard
 *
 * Both tools rely on the `mobile: getClipboard` / `mobile: setClipboard`
 * Appium execute commands and work on Android, iOS, and remote WebDriver
 * sessions.
 */
export default function clipboard(server: FastMCP): void {
  // ─── Get Clipboard ────────────────────────────────────────────────────────

  server.addTool({
    name: 'appium_mobile_get_clipboard',
    description:
      'Get the current clipboard content as plain text from the device. ' +
      'Works on Android (UiAutomator2) and iOS (XCUITest). ' +
      'Returns an empty string if the clipboard is empty.',
    parameters: z.object({
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: { sessionId?: string },
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const content = await getClipboard(driver);
        if (!content) {
          return textResult('Clipboard is empty.');
        }
        return textResult(`Clipboard content: ${content}`);
      } catch (err: unknown) {
        return errorResult(
          `Failed to get clipboard content. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });

  // ─── Set Clipboard ────────────────────────────────────────────────────────

  const setClipboardSchema = z.object({
    content: z
      .string()
      .describe('The plain text content to write to the device clipboard'),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_set_clipboard',
    description:
      'Set the device clipboard to the provided plain text. ' +
      'Works on Android (UiAutomator2) and iOS (XCUITest). ' +
      'Useful for pre-filling clipboard content before testing paste operations, ' +
      'or for injecting long strings without typing them character by character.',
    parameters: setClipboardSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof setClipboardSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        await setClipboard(driver, args.content);
        return textResult(
          `Successfully set clipboard content to: ${args.content}`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to set clipboard content. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
