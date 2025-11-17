import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export default function screenshot(server: FastMCP): void {
  server.addTool({
    name: 'appium_screenshot',
    description:
      'Take a screenshot of the current screen and return as PNG image',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const screenshotBase64 = await driver.getScreenshot();

        // Convert base64 to buffer
        const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');

        // Generate filename with timestamp
        const timestamp = Date.now();
        const filename = `screenshot_${timestamp}.png`;
        const filepath = join(process.cwd(), filename);

        // Save screenshot to disk
        await writeFile(filepath, screenshotBuffer);

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot saved successfully to: ${filename}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to take screenshot. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
