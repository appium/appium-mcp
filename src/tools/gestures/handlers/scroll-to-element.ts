import type {ContentResult} from 'fastmcp';

import {
  findElement,
  getPageSource,
  isElementDisplayed,
  getElementAttribute,
  getElementRect,
  getWindowRect,
  getCurrentContext,
} from '../../../command.js';
import log from '../../../logger.js';
import {getPlatformName, type DriverInstance} from '../../../session-store.js';
import {errorResult, textResult, toolErrorMessage, readWebElementId} from '../../tool-response.js';
import type {GestureArgs} from '../schema.js';
import {performVerticalScroll} from './swipe-scroll.js';

const PRESET_TO_DISTANCE: Record<NonNullable<GestureArgs['scrollDistancePreset']>, number> = {
  small: 0.25,
  medium: 0.45,
  large: 1,
};

export async function handleScrollToElement(driver: DriverInstance, args: GestureArgs): Promise<ContentResult> {
  if (!args.strategy || !args.selector) {
    return errorResult('scroll_to_element requires both strategy and selector.');
  }
  const direction: 'up' | 'down' = args.direction === 'up' || args.direction === 'down' ? args.direction : 'down';

  const maxScroll = args.maxScrollAttempts;
  if (args.scrollDistancePreset && args.scrollDistance !== undefined) {
    log.warn('scroll_to_element: scrollDistancePreset is set; ignoring scrollDistance');
  }
  const distance = resolveScrollDistance(args);

  try {
    const nativeIOS =
      getPlatformName(driver).toLowerCase() === 'ios' && (await getCurrentContext(driver)) === 'NATIVE_APP';
    const selector =
      nativeIOS && args.strategy === '-ios predicate string' ? withoutVisibleConjunct(args.selector) : args.selector;
    if (await isTargetVisible(driver, args.strategy, selector, nativeIOS)) {
      return textResult(`Element ${args.selector} is already visible on screen.`);
    }

    let scrollsDone = 0;
    while (scrollsDone < maxScroll) {
      const xmlBefore = await getPageSource(driver);
      try {
        await performVerticalScroll(driver, {direction, distance});
      } catch (scrollErr: unknown) {
        return errorResult(`Scroll failed during scroll_to_element: ${toolErrorMessage(scrollErr)}`);
      }
      const xmlAfter = await getPageSource(driver);
      scrollsDone++;

      if (await isTargetVisible(driver, args.strategy, selector, nativeIOS)) {
        return textResult(`Successfully scrolled to element ${args.selector} after ${scrollsDone} scroll(s).`);
      }

      if (xmlBefore === xmlAfter) {
        return errorResult(
          `Element not visible; page source did not change after scroll (likely end of scrollable content). selector=${args.selector}`,
        );
      }
    }

    return errorResult(
      `Element ${args.selector} not visible after ${maxScroll} scroll(s) in direction '${direction}'.`,
    );
  } catch (err) {
    return errorResult(`Failed to scroll_to_element. ${toolErrorMessage(err)}`);
  }
}

function resolveScrollDistance(args: GestureArgs): number {
  if (args.scrollDistancePreset) {
    return PRESET_TO_DISTANCE[args.scrollDistancePreset];
  }
  if (args.scrollDistance !== undefined) {
    return args.scrollDistance;
  }
  return 0.45;
}

async function isTargetVisible(
  driver: DriverInstance,
  strategy: string,
  selector: string,
  nativeIOS: boolean,
): Promise<boolean> {
  try {
    const element = await findElement(driver, strategy, selector);
    const elementId = readWebElementId(element);
    if (!elementId) {
      throw new Error('Element was returned without a valid element ID');
    }
    if (!truthy(await isElementDisplayed(driver, elementId))) {
      return false;
    }
    if (nativeIOS) {
      // XCUITest's visibility alone can include nodes covered by navigation/tab bars.
      if (!truthy(await getElementAttribute(driver, elementId, 'hittable'))) {
        return false;
      }
      const rect = await getElementRect(driver, elementId);
      const window = await getWindowRect(driver);
      if (
        !(
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x >= window.x &&
          rect.y >= window.y &&
          rect.x + rect.width <= window.x + window.width &&
          rect.y + rect.height <= window.y + window.height
        )
      ) {
        return false;
      }
    }
    return true;
  } catch (error) {
    // A missing/stale target is expected while scrolling. Invalid selectors and
    // driver failures must remain actionable errors, not trigger repeated gestures.
    if (/no such element|could not be located|stale element/i.test(toolErrorMessage(error))) {
      return false;
    }
    throw error;
  }
}

function truthy(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** Remove only standalone visibility clauses from a simple AND predicate.
 * Preserve quoted strings, nested expressions, and OR/NOT semantics unchanged.
 */
export function withoutVisibleConjunct(selector: string): string {
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (quote) {
      if (char === '\\') {
        index++;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === ')' || char === '|' || char === '!') {
      return selector;
    }
    if (/^(?:OR|NOT)\b/i.test(selector.slice(index)) && (index === 0 || /\s/.test(selector[index - 1]))) {
      return selector;
    }
    const and = /^(?:AND\b|&&)/i.exec(selector.slice(index));
    if (and && (index === 0 || /\s/.test(selector[index - 1]))) {
      parts.push(selector.slice(start, index).trim());
      index += and[0].length - 1;
      start = index + 1;
    }
  }
  if (quote) {
    return selector;
  }
  parts.push(selector.slice(start).trim());
  const remaining = parts.filter((part) => !/^visible\s*==?\s*(?:1|true|yes)$/i.test(part));
  return remaining.length > 0 && remaining.length < parts.length ? remaining.join(' AND ') : selector;
}
