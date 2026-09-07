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
      'iOS prefer accessibility id > -ios predicate string > -ios class chain; ' +
        'Android prefer accessibility id > id > -android uiautomator; xpath last on both. ' +
        'accessibility id is cross-platform, fastest and stable; id is Android resource-id or an iOS accessibility-id alias. ' +
        'name is legacy; class name may match multiple elements; css selector is webview-only.',
    ),
  selector: z
    .string()
    .describe('Selector for the strategy. Do not pass natural-language descriptions; use appium_ai if enabled.'),
  sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description:
      'Find an element by strategy and selector; returns its ID for interactions. ' +
      'Prefer accessibility id > id > platform-native > xpath (last resort: slow/brittle). ' +
      'For offscreen targets use appium_gesture action=scroll_to_element; for vision use appium_ai action=find_element if enabled.',
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
        return withEvidence(
          textResultWithPrimaryElementId(
            elementId,
            `Successfully found element ${args.selector} with strategy ${args.strategy}.`,
          ),
          {
            name: 'appium_find_element',
            stage: 'locate',
            startedAt,
            locator,
            element: {webdriverId: elementId},
            context,
          },
        );
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
