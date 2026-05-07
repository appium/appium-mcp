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
  strategy: z
    .enum([
      'accessibility id',
      'id',
      '-ios predicate string',
      '-ios class chain',
      '-android uiautomator',
      'xpath',
      'name',
      'class name',
      'css selector',
    ])
    .describe(
      `Locator strategy. Try in priority order: ` +
        `(1) accessibility id [cross-platform, fastest, most stable], ` +
        `(2) id [Android resource-id; iOS aliases accessibility id], ` +
        `(3) -ios predicate string [iOS native, fast], ` +
        `(4) -ios class chain [iOS native, hierarchy queries], ` +
        `(5) -android uiautomator [Android native, expressive UiSelector], ` +
        `(6) xpath [LAST RESORT — slow on iOS XCUITest, brittle to layout changes], ` +
        `(7) name [legacy; often aliased on iOS], ` +
        `(8) class name [too generic, usually multi-match], ` +
        `(9) css selector [webview/hybrid contexts only]. ` +
        `Platform tips: iOS prefer (1)→(3)→(4); Android prefer (1)→(2)→(5); xpath last on both. ` +
        `For natural-language / vision-based find, use the appium_ai tool (action=find_element), not this one.`
    ),
  selector: z
    .string()
    .describe(
      `Selector string for the chosen strategy. ` +
        `Do not pass natural-language descriptions of the target here; use appium_ai (action=find_element) for that.`
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `Find a specific element by strategy and selector which will return a uuid that can be used for interactions.

[PRIORITY 2: Use this to search for a target element.]

**Strategy priority**: accessibility id > id > platform-native (\`-ios predicate string\` / \`-ios class chain\` on iOS, \`-android uiautomator\` on Android) > xpath (last resort — slow & brittle). See the \`strategy\` parameter for the full ranking.

**Scrolling until an element appears**: use \`appium_gesture\` with \`action=scroll_to_element\` (same strategy + selector), not this tool.

**Vision / natural-language find**: use \`appium_ai\` with \`action=find_element\`, not this tool.`,
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
          return errorResult('Element was returned without a valid element ID');
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
