/**
 * Tools for managing browser tabs in Playwright sessions
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';

export function newTab(server: FastMCP): void {
  const newTabSchema = z.object({
    url: z
      .string()
      .optional()
      .describe('Optional URL to navigate to in the new tab'),
  });

  server.addTool({
    name: 'playwright_new_tab',
    description:
      'Open a new browser tab, optionally navigating to a URL. The new tab becomes the active page. Only works with Playwright web sessions.',
    parameters: newTabSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
    },
    execute: async (
      args: z.infer<typeof newTabSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const page = await driver.context.newPage();
        if (args.url) {
          await page.goto(args.url);
        }
        driver.setPage(page);

        const title = await page.title();
        const url = page.url();
        const totalTabs = driver.context.pages().length;

        return {
          content: [
            {
              type: 'text',
              text: `New tab opened (tab ${totalTabs}).\nURL: ${url}\nTitle: ${title}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to open new tab. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function switchTab(server: FastMCP): void {
  const switchTabSchema = z.object({
    index: z
      .number()
      .int()
      .min(0)
      .describe('Zero-based index of the tab to switch to'),
  });

  server.addTool({
    name: 'playwright_switch_tab',
    description:
      'Switch to a different browser tab by index. Only works with Playwright web sessions.',
    parameters: switchTabSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof switchTabSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const pages = driver.context.pages();
        if (args.index >= pages.length) {
          throw new Error(
            `Tab index ${args.index} is out of range. There are ${pages.length} tab(s) (0-${pages.length - 1}).`
          );
        }

        const page = pages[args.index];
        driver.setPage(page);
        await page.bringToFront();

        const title = await page.title();
        const url = page.url();

        return {
          content: [
            {
              type: 'text',
              text: `Switched to tab ${args.index}.\nURL: ${url}\nTitle: ${title}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to switch tab. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function listTabs(server: FastMCP): void {
  server.addTool({
    name: 'playwright_list_tabs',
    description:
      'List all open browser tabs with their URLs and titles. Only works with Playwright web sessions.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const pages = driver.context.pages();
        const currentPage = driver.page;

        const tabInfo = await Promise.all(
          pages.map(async (page, index) => {
            const title = await page.title();
            const url = page.url();
            const isActive = page === currentPage ? ' (active)' : '';
            return `  ${index}. ${title || '(no title)'} - ${url}${isActive}`;
          })
        );

        return {
          content: [
            {
              type: 'text',
              text: `Open tabs (${pages.length}):\n${tabInfo.join('\n')}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list tabs. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function closeTab(server: FastMCP): void {
  const closeTabSchema = z.object({
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Zero-based index of the tab to close. Defaults to the current active tab.'
      ),
  });

  server.addTool({
    name: 'playwright_close_tab',
    description:
      'Close a browser tab by index, or close the current active tab if no index is provided. Only works with Playwright web sessions.',
    parameters: closeTabSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof closeTabSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const pages = driver.context.pages();
        const targetIndex = args.index ?? pages.indexOf(driver.page);

        if (targetIndex < 0 || targetIndex >= pages.length) {
          throw new Error(
            `Tab index ${targetIndex} is out of range. There are ${pages.length} tab(s).`
          );
        }

        const pageToClose = pages[targetIndex];
        await pageToClose.close();

        // Switch to the last remaining tab if we closed the active one
        const remaining = driver.context.pages();
        if (remaining.length > 0 && pageToClose === driver.page) {
          driver.setPage(remaining[remaining.length - 1]);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Tab ${targetIndex} closed. ${remaining.length} tab(s) remaining.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to close tab. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
