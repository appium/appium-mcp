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

import {getPageSource} from '../../command.js';
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
    description: `Generate locators for all interactable elements on the current page. [PRIORITY 3: Use this for debugging/inspection or when you need comprehensive element info with locator suggestions]`,
    _meta: mcpAppsEnabled ? {ui: {resourceUri: LOCATOR_GENERATOR_URI}} : undefined,
    parameters: z.object({
      sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: {sessionId?: string}, context: any): Promise<any> => {
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

        let driverName: string;
        if (isAndroidUiautomator2DriverSession(driver)) {
          driverName = driver.caps.automationName?.toLowerCase() ?? '';
        } else if (isXCUITestDriverSession(driver)) {
          driverName = driver.caps.automationName?.toLowerCase() ?? '';
        } else {
          driverName = driver.capabilities['appium:automationName']?.toLowerCase() ?? '';
        }

        const interactableElements = generateAllElementLocators(pageSource, true, driverName, {fetchableOnly: true});

        const textResponse = textResult(
          JSON.stringify({
            interactableElements,
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
            createLocatorGeneratorUI(interactableElements),
          ),
        );
      } catch (err: unknown) {
        log.error('Error getting page source:', err);
        return errorResult(`Failed to get page source: ${toolErrorMessage(err)}`);
      }
    },
  });
}
