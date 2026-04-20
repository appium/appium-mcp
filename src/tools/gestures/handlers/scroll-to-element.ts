import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../../session-store.js';
import { getPlatformName, PLATFORM } from '../../../session-store.js';
import { execute, getWindowRect, performActions } from '../../../command.js';
import {
  errorResult,
  textResult,
  toolErrorMessage,
} from '../../tool-response.js';
import type { GestureArgs } from '../schema.js';

const MAX_SCROLL_ATTEMPTS = 10;

async function tryFindElement(
  driver: DriverInstance,
  strategy: string,
  selector: string
): Promise<boolean> {
  try {
    await driver.findElement(strategy, selector);
    return true;
  } catch {
    return false;
  }
}

async function performW3CScroll(
  driver: DriverInstance,
  direction: 'up' | 'down'
): Promise<void> {
  const { width, height } = await getWindowRect(driver);
  const startX = Math.floor(width / 2);
  const startY =
    direction === 'down'
      ? Math.floor(height * 0.8)
      : Math.floor(height * 0.2);
  const endY =
    direction === 'down'
      ? Math.floor(height * 0.2)
      : Math.floor(height * 0.8);

  await performActions(driver, [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 250 },
        { type: 'pointerMove', duration: 600, x: startX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
}

async function scrollOnce(
  driver: DriverInstance,
  direction: 'up' | 'down'
): Promise<void> {
  const platform = getPlatformName(driver);
  if (platform === PLATFORM.ios) {
    await execute(driver, 'mobile: scroll', { direction });
    return;
  }
  // Android: prefer UiScrollable (native, reliable); fall back to W3C scroll.
  const method = direction === 'up' ? 'scrollBackward' : 'scrollForward';
  const selector = `new UiScrollable(new UiSelector().scrollable(true)).${method}()`;
  try {
    await driver.findElement('-android uiautomator', selector);
  } catch {
    await performW3CScroll(driver, direction);
  }
}

export async function handleScrollToElement(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  if (!args.strategy || !args.selector) {
    return errorResult(
      'scroll_to_element requires both strategy and selector.'
    );
  }
  const direction: 'up' | 'down' =
    args.direction === 'up' || args.direction === 'down'
      ? args.direction
      : 'down';

  try {
    if (await tryFindElement(driver, args.strategy, args.selector)) {
      return textResult(
        `Element ${args.selector} is already visible on screen.`
      );
    }

    for (let attempt = 1; attempt <= MAX_SCROLL_ATTEMPTS; attempt++) {
      await scrollOnce(driver, direction);
      if (await tryFindElement(driver, args.strategy, args.selector)) {
        return textResult(
          `Successfully scrolled to element ${args.selector} after ${attempt} scroll(s).`
        );
      }
    }

    return errorResult(
      `Element ${args.selector} not found after ${MAX_SCROLL_ATTEMPTS} scrolls in direction '${direction}'.`
    );
  } catch (err) {
    return errorResult(
      `Failed to scroll_to_element. ${toolErrorMessage(err)}`
    );
  }
}
