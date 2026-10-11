import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {findElement as findSingleElement} from '../../command.js';
import {withEvidence, evidenceContext} from '../evidence.js';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
  readWebElementId,
  readWebElementAttributes,
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
      [
        'accessibility id: cross-platform, fast and stable. id: Android resource-id; iOS accessibility-id alias.',
        'iOS prefer accessibility id > -ios predicate string > -ios class chain; Android prefer accessibility id > id > -android uiautomator. Use xpath last (slow/brittle).',
        'name: legacy; class name: broad matches; css selector: webview only.',
      ].join('\n'),
    ),
  selector: z
    .string()
    .describe(
      'Selector for the strategy. Do not pass natural-language descriptions; use appium_ai action=find_element for vision.',
    ),
  sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: [
      'Find an element by strategy and selector. Pass its ID as elementUUID to interaction tools. Returns driver attributes as JSON. ' +
        'For drivers supporting elementResponseAttributes, use appium_driver_settings to configure it with shouldUseCompactResponses=false.',
      'Prefer accessibility id > id > platform-native > xpath (last resort: slow/brittle). See strategy for platform-specific guidance.',
      'To scroll until a target is found, use appium_gesture action=scroll_to_element with the same strategy and selector, rather than repeatedly calling this tool.',
      'Vision fallback: appium_ai action=find_element (if enabled).',
    ].join('\n'),
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const {driver} = resolved;

      const startedAt = Date.now();
      const locator = {strategy: args.strategy, selector: args.selector};
      const context = await evidenceContext(args.sessionId);
      try {
        const element = await findSingleElement(driver, args.strategy, args.selector);
        const elementId = readWebElementId(element);
        if (!elementId) {
          return withEvidence(errorResult('Element was returned without a valid element ID'), {
            name: 'appium_find_element',
            stage: 'locate',
            startedAt,
            locator,
            context,
          });
        }
        const response = textResultWithPrimaryElementId(
          elementId,
          `Successfully found element ${args.selector} with strategy ${args.strategy}.`,
        );
        const attributes = readWebElementAttributes(element);
        if (Object.keys(attributes).length > 0) {
          response.content.push({type: 'text', text: JSON.stringify({elementId, attributes})});
        }
        return withEvidence(response, {
          name: 'appium_find_element',
          stage: 'locate',
          startedAt,
          locator,
          element: {webdriverId: elementId},
          context,
        });
      } catch (err: unknown) {
        return withEvidence(errorResult(`Failed to find element. Error: ${toolErrorMessage(err)}`), {
          name: 'appium_find_element',
          stage: 'locate',
          startedAt,
          locator,
          context,
          error: err,
        });
      }
    },
  });
}
