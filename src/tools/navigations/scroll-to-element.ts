import { getDriver, getPlatformName } from '../../session-store.js';
import { z } from 'zod';

const scrollToElementSchema = z.object({
  strategy: z.enum([
    'xpath',
    'id',
    'name',
    'class name',
    'accessibility id',
    'css selector',
    '-android uiautomator',
    '-ios predicate string',
    '-ios class chain',
  ]),
  selector: z.string().describe('The selector to find the element'),
  direction: z
    .enum(['up', 'down'])
    .default('down')
    .describe('Direction to scroll when searching for the element'),
});

const getValue = (xpath: string, expression: string): string => {
  // Extracts the value from an XPath expression.
  let start = xpath.indexOf(expression) + expression.length;
  start = xpath.indexOf("'", start) + 1;
  const end = xpath.indexOf("'", start);
  return xpath.substring(start, end);
};

const transformXPath = (
  xpath: string
): { strategy: string; selector: string } => {
  // normalize xpath expression by replacing " by '
  xpath = xpath.replace(/"/g, "'");
  if (xpath.includes('@text=')) {
    return { strategy: 'text', selector: getValue(xpath, '@text=') };
  }

  if (xpath.includes('@content-desc=')) {
    return {
      strategy: 'description',
      selector: getValue(xpath, '@content-desc='),
    };
  }

  if (xpath.includes('contains(@text,')) {
    return {
      strategy: 'textContains',
      selector: getValue(xpath, 'contains(@text,'),
    };
  }

  if (xpath.includes('contains(@content-desc,')) {
    return {
      strategy: 'descriptionContains',
      selector: getValue(xpath, 'contains(@content-desc,'),
    };
  }

  throw new Error(
    `Unsupported XPath expression: ${xpath}. Supported expressions are: @text, @content-desc, contains(@text, ...), contains(@content-desc, ...)`
  );
};

const transformLocator = (
  strategy: string,
  selector: string
): { strategy: string; selector: string } => {
  if (strategy === 'id') {
    return { strategy: 'resourceId', selector };
  }
  if (strategy === 'xpath') {
    return transformXPath(selector);
  }
  if (strategy === 'class name') {
    return { strategy: 'className', selector };
  }

  return { strategy, selector };
};

async function performAndroidScroll(
  driver: any,
  args: any,
  direction: string
): Promise<void> {
  // Use UiAutomator scroll gestures for Android
  const scrollDirection =
    direction === 'up' ? 'scrollBackward' : 'scrollForward';
  const scrollCommand = `new UiScrollable(new UiSelector().scrollable(true)).${scrollDirection}()`;

  try {
    await driver.findElement('-android uiautomator', scrollCommand);
  } catch (error) {
    // If UiScrollable fails, try touch actions
    const { width, height } = await driver.getWindowRect();
    const startX = width / 2;
    const startY = direction === 'up' ? height * 0.3 : height * 0.7;
    const endY = direction === 'up' ? height * 0.7 : height * 0.3;

    await driver.touchAction([
      { action: 'press', x: startX, y: startY },
      { action: 'wait', ms: 500 },
      { action: 'moveTo', x: startX, y: endY },
      { action: 'release' },
    ]);
  }
}

async function performiOSScroll(driver: any, direction: string): Promise<void> {
  // Use iOS mobile commands for scrolling
  const { width, height } = await driver.getWindowRect();

  await driver.execute('mobile: scroll', {
    direction,
    startX: width / 2,
    startY: direction === 'up' ? height * 0.3 : height * 0.7,
    endX: width / 2,
    endY: direction === 'up' ? height * 0.7 : height * 0.3,
  });
}

export default function scrollToElement(server: any): void {
  server.addTool({
    name: 'appium_scroll_to_element',
    description: 'Scrolls the current screen till a certain element is visible',
    parameters: scrollToElementSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error(
          'No active driver session. Please create a session first.'
        );
      }

      try {
        const platform = getPlatformName(driver);

        // First try to find the element directly (it might already be in viewport)
        try {
          const element = await (driver as any).findElement(
            args.strategy,
            args.selector
          );
          return {
            content: [
              {
                type: 'text',
                text: `Element ${args.selector} is already visible on screen.`,
              },
            ],
          };
        } catch (error) {
          const direction = args.direction || 'down';
          switch (platform) {
            case 'Android':
              await performAndroidScroll(driver, args, direction);
              break;
            case 'iOS':
              await performiOSScroll(driver, direction);
              break;
            default:
              throw new Error(
                'Unsupported driver type. This tool only supports Android and iOS drivers.'
              );
          }

          const element = await (driver as any).findElement(
            args.strategy,
            args.selector
          );
          return {
            content: [
              {
                type: 'text',
                text: `Successfully scrolled found element ${args.selector} after initial scroll.`,
              },
            ],
          };
        }
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to scroll and find element. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
