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
      [
        'Locator strategy. Prefer stable identifiers, then platform-native queries; xpath is the last resort.',
        '- accessibility id: cross-platform, fast and stable when available.',
        '- id: Android resource-id; an accessibility-id alias on iOS.',
        '- -ios predicate string: fast native iOS queries on element attributes.',
        '- -ios class chain: native iOS hierarchy queries.',
        '- -android uiautomator: native Android queries using UiSelector.',
        '- xpath: last resort; slow on iOS XCUITest and brittle to layout changes.',
        '- name: legacy; often aliased on iOS.',
        '- class name: usually too generic and may match multiple elements.',
        '- css selector: webview/hybrid web contexts only, not native screens.',
        'iOS prefer accessibility id > -ios predicate string > -ios class chain; Android prefer accessibility id > id > -android uiautomator. Use xpath last on both.',
      ].join('\n'),
    ),
  selector: z
    .string()
    .describe(
      'Selector string for the chosen strategy. Do not pass natural-language descriptions of the target here; ' +
        'use appium_ai action=find_element if enabled for vision-based finding.',
    ),
  sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: [
      'Find an element by strategy and selector; the primary tool for locating a specific target. Returns its ID for interactions. ' +
        'Pass that ID as elementUUID to interaction tools.',
      'Prefer accessibility id > id > platform-native > xpath (last resort: slow/brittle). See strategy for platform-specific guidance.',
      'To scroll until a target is found, use appium_gesture action=scroll_to_element with the same strategy and selector, rather than repeatedly calling this tool.',
      'For natural-language/vision finding, use appium_ai action=find_element if enabled and stable locators do not work.',
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
