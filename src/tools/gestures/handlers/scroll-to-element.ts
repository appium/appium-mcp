import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../../session-store.js';
import { getPageSource } from '../../../command.js';
import log from '../../../logger.js';
import {
  errorResult,
  textResult,
  toolErrorMessage,
} from '../../tool-response.js';
import type { GestureArgs } from '../schema.js';
import { performVerticalScroll } from './swipe-scroll.js';

const PRESET_TO_DISTANCE: Record<
  NonNullable<GestureArgs['scrollDistancePreset']>,
  number
> = {
  small: 0.25,
  medium: 0.45,
  large: 1,
};

function resolveScrollDistance(args: GestureArgs): number {
  if (args.scrollDistancePreset) {
    return PRESET_TO_DISTANCE[args.scrollDistancePreset];
  }
  if (args.scrollDistance !== undefined) {
    return args.scrollDistance;
  }
  return 0.45;
}

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

  const maxScroll = args.maxScrollAttempts;
  if (args.scrollDistancePreset && args.scrollDistance !== undefined) {
    log.warn(
      'scroll_to_element: scrollDistancePreset is set; ignoring scrollDistance'
    );
  }
  const distance = resolveScrollDistance(args);

  try {
    if (await tryFindElement(driver, args.strategy, args.selector)) {
      return textResult(
        `Element ${args.selector} is already visible on screen.`
      );
    }

    let scrollsDone = 0;
    while (scrollsDone < maxScroll) {
      const xmlBefore = await getPageSource(driver);
      try {
        await performVerticalScroll(driver, { direction, distance });
      } catch (scrollErr: unknown) {
        return errorResult(
          `Scroll failed during scroll_to_element: ${toolErrorMessage(scrollErr)}`
        );
      }
      const xmlAfter = await getPageSource(driver);
      scrollsDone++;

      if (await tryFindElement(driver, args.strategy, args.selector)) {
        return textResult(
          `Successfully scrolled to element ${args.selector} after ${scrollsDone} scroll(s).`
        );
      }

      if (xmlBefore === xmlAfter) {
        return errorResult(
          `Element not found; page source did not change after scroll (likely end of scrollable content). selector=${args.selector}`
        );
      }
    }

    return errorResult(
      `Element ${args.selector} not found after ${maxScroll} scroll(s) in direction '${direction}'.`
    );
  } catch (err) {
    return errorResult(`Failed to scroll_to_element. ${toolErrorMessage(err)}`);
  }
}
