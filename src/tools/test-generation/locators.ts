/**
 * Tool to get page source from the Android session
 *
 * TOOL EXTENSION GUIDE:
 * This tool demonstrates the traditional approach where metadata is defined inline.
 *
 * ALTERNATIVE APPROACH: You can also use YAML metadata files for better separation.
 * See src/tools/metadata/ for examples and src/tools/scroll-with-yaml.example.ts
 *
 * For detailed documentation on adding tools, see docs/CONTRIBUTING.md
 */
import type {FastMCP} from 'fastmcp';
import {z} from 'zod';

import {getCurrentContext, getPageSource} from '../../command.js';
import {generateAllElementLocators} from '../../locators/generate-all-locators.js';
import {LOCATOR_GENERATOR_URI} from '../../resources/locator-generator.js';
import {isAndroidUiautomator2DriverSession, isXCUITestDriverSession} from '../../session-store.js';
import {clientSupportsMcpApps, isMcpAppsEnabled} from '../../ui/mcp-apps.js';
import {createUIResource, createLocatorGeneratorUI, addUIResourceToResponse} from '../../ui/mcp-ui-utils.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';

export default function generateLocators(server: FastMCP): void {
  const mcpAppsEnabled = isMcpAppsEnabled();
  server.addTool({
    name: 'generate_locators',
    description: `Generate current-page locator candidates for inspection. Defaults: controls for UiAutomator2/XCUITest/Web; all elements except hierarchy for other native drivers.`,
    _meta: mcpAppsEnabled ? {ui: {resourceUri: LOCATOR_GENERATOR_URI}} : undefined,
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Case-insensitive literal substring of an element tag or attribute value (name, label, text, ID, etc.). Searches all element types, including hidden elements. Blank or omitted keeps the default driver-specific filter.',
        ),
      xpathAttributes: z
        .array(
          z
            .string()
            .trim()
            .regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/),
        )
        .max(20)
        .optional()
        .describe(
          'Additional XPath attribute names in priority order, e.g. AutomationId or data-testid. Tried before built-in attributes; defaults remain as fallback. No namespace prefixes or XPath expressions.',
        ),
      sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: {sessionId?: string; query?: string; xpathAttributes?: string[]},
      context: any,
    ): Promise<any> => {
      const {log} = context;
      log.info('Getting page source');
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const {driver} = resolved;

      try {
        const pageSource = await getPageSource(driver);
        if (!pageSource) {
          return errorResult('Page source is empty or null.');
        }

        const capabilities: {automationName?: string; 'appium:automationName'?: string; browserName?: string} =
          isAndroidUiautomator2DriverSession(driver) || isXCUITestDriverSession(driver)
            ? driver.caps
            : driver.capabilities;
        const driverName = String(
          capabilities['appium:automationName'] ?? capabilities.automationName ?? '',
        ).toLowerCase();
        // Read the driver's current context: a cached NATIVE_APP value can be stale
        // after attaching to a session that already has an active WebView.
        const isNative = ['uiautomator2', 'xcuitest'].includes(driverName)
          ? (await getCurrentContext(driver)) === 'NATIVE_APP'
          : !capabilities.browserName;

        const query = args.query?.trim();
        const elementsWithLocators = generateAllElementLocators(pageSource, isNative, driverName, {
          ...(query ? {query, fetchableOnly: false} : {fetchableOnly: true}),
          ...(args.xpathAttributes?.length ? {xpathAttributes: [...new Set(args.xpathAttributes)]} : {}),
        });

        const textResponse = textResult(
          JSON.stringify({
            interactableElements: elementsWithLocators,
            message: 'Page source retrieved successfully',
            instruction: `These are the locators for the current page. Use this to generate code for the current page.
                     Using the template provided by generate://code-with-locators resource.`,
          }),
        );

        // The static MCP App reads the existing JSON text result instead of
        // receiving a second copy rendered into inline HTML.
        if (mcpAppsEnabled && clientSupportsMcpApps(server, context)) {
          return textResponse;
        }

        return addUIResourceToResponse(textResponse, () =>
          createUIResource(
            `ui://appium-mcp/locator-generator/${Date.now()}`,
            createLocatorGeneratorUI(elementsWithLocators),
          ),
        );
      } catch (err: unknown) {
        log.error('Error getting page source:', err);
        return errorResult(`Failed to get page source: ${toolErrorMessage(err)}`);
      }
    },
  });
}
