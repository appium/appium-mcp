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
import { z } from 'zod';
import {
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
} from '../../session-store.js';
import { generateAllElementLocators } from '../../locators/generate-all-locators.js';
import {
  createUIResource,
  createLocatorGeneratorUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { getPageSource } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export default function generateLocators(server: any): void {
  server.addTool({
    name: 'generate_locators',
    description: `Generate locators for all interactable elements on the current page. [PRIORITY 3: Use this for debugging/inspection or when you need comprehensive element info with locator suggestions]`,
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
      { log }: any
    ): Promise<any> => {
      log.info('Getting page source');
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) return resolved.result;
      const { driver } = resolved;

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
          driverName =
            driver.capabilities['appium:automationName']?.toLowerCase() ?? '';
        }

        const interactableElements = generateAllElementLocators(
          pageSource,
          true,
          driverName,
          { fetchableOnly: true }
        );

        const textResponse = textResult(
          JSON.stringify({
            interactableElements,
            message: 'Page source retrieved successfully',
            instruction: `This the locators for the current page. Use this to generate code for the current page.
                     Using the template provided by generate://code-with-locators resource.`,
          })
        );

        const uiResource = createUIResource(
          `ui://appium-mcp/locator-generator/${Date.now()}`,
          createLocatorGeneratorUI(interactableElements)
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (err: unknown) {
        log.error('Error getting page source:', err);
        return errorResult(
          `Failed to get page source: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
