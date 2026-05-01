import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
  readWebElementId,
} from '../tool-response.js';

export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath',
    'id',
    'name',
    'class name',
    'accessibility id',
    'css selector',
    '-android uiautomator',
    '-ios predicate string',
    '-ios class chain',
  ]),
  selector: z.string().describe('The selector to find the element.'),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `Find a specific element by strategy and selector which will return a uuid that can be used for interactions.

[PRIORITY 2: Use this to search for a target element by xpath, id, accessibility id, etc.]

**Scrolling until an element appears**: use \`appium_gesture\` with \`action=scroll_to_element\` (same strategy + selector), not this tool.`,
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const element = await driver.findElement(args.strategy, args.selector);
        const elementId = readWebElementId(element);
        if (!elementId) {
          throw new Error('Element was returned without a valid element ID');
        }
        return textResultWithPrimaryElementId(
          elementId,
          `Successfully found element ${args.selector} with strategy ${args.strategy}.`
        );
      } catch (err: unknown) {
        const errorMessage = toolErrorMessage(err);
        return errorResult(`Failed to find element. Error: ${errorMessage}`);
      }
    },
  });
}
