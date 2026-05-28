import type { AppiumMcpPlugin, McpRegistry } from '../plugin.js';
import {
  executeScreenshot,
  screenshotSchema,
  type ScreenshotArgs,
} from '../tools/interactions/screenshot.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Built-in plugin that registers the appium_screenshot tool.
 */
export class AppiumScreenshotPlugin implements AppiumMcpPlugin {
  readonly name = 'appium-screenshot';
  readonly version = pkg.version;

  register(registry: McpRegistry): void {
    registry.addTool(
      'appium_screenshot',
      'Take a screenshot and save as PNG. Optionally provide elementUUID to capture only that element.',
      screenshotSchema,
      async (args: ScreenshotArgs) =>
        executeScreenshot({
          elementId: args.elementUUID,
          maxWidth: args.maxWidth,
          sessionId: args.sessionId,
        })
    );
  }
}
