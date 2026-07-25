import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const schema = z.object({
  action: z
    .enum(['hide', 'is_shown'])
    .describe('hide dismisses; is_shown checks visibility.'),
  keys: z
    .array(z.string())
    .optional()
    .describe('hide-only optional dismissal key names.'),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

type KeyboardArgs = z.infer<typeof schema>;

export default function keyboard(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_keyboard',
    description: 'Hide the software keyboard or query visibility.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: KeyboardArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        switch (args.action) {
          case 'hide':
            return await handleHide(args.sessionId, args.keys);
          case 'is_shown':
            return await handleIsShown(args.sessionId);
        }
      } catch (err: unknown) {
        const msg = toolErrorMessage(err);
        if (args.action === 'hide') {
          return errorResult(`Failed to hide keyboard. Error: ${msg}`);
        }
        return errorResult(
          `Failed to query keyboard visibility. Error: ${msg}`
        );
      }
    },
  });
}

async function handleHide(
  sessionId: string | undefined,
  keys: string[] | undefined
): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  const params = keys && keys.length > 0 ? { keys } : {};
  await execute(driver, 'mobile: hideKeyboard', params);
  return textResult('Keyboard dismissed successfully.');
}

async function handleIsShown(sessionId?: string): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  const keyboardShown = await execute(driver, 'mobile: isKeyboardShown', {});
  return textResult(JSON.stringify({ keyboardShown }, null, 2));
}
