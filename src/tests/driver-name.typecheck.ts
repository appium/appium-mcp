import type {shouldIncludeElement} from '../locators/element-filter.js';
import type {generateAllElementLocators} from '../locators/generate-all-locators.js';
import type {getComplexSuggestedLocators, getSuggestedLocators} from '../locators/locator-generation.js';
import type {DriverName} from '../locators/types.js';

// Compile-time assertions: checked by tsc, not Jest. This function is never executed.
export function checkDriverNameTypes(
  acceptDriverName: (name: DriverName) => void,
  generateAll: typeof generateAllElementLocators,
  suggest: typeof getSuggestedLocators,
  suggestComplex: typeof getComplexSuggestedLocators,
  filter: typeof shouldIncludeElement,
) {
  acceptDriverName('uiautomator2');
  acceptDriverName('xcuitest');
  acceptDriverName('my-custom-driver');
  acceptDriverName('');
  // @ts-expect-error Driver names must be lowercase.
  acceptDriverName('UiAutomator2');
  // @ts-expect-error Uppercase driver names are rejected too.
  acceptDriverName('XCUITEST');

  // Check public signatures too, so widening a parameter to string is detected.
  // @ts-expect-error The entry point requires a lowercase driver name.
  generateAll('<root/>', true, 'UiAutomator2');
  // @ts-expect-error Locator generation preserves the lowercase constraint.
  const suggestedDriver: Parameters<typeof suggest>[3] = 'XCUITest';
  // @ts-expect-error Complex locator generation preserves the lowercase constraint.
  const complexDriver: Parameters<typeof suggestComplex>[3] = 'Mac2';
  // @ts-expect-error Element filtering preserves the lowercase constraint.
  const filterDriver: Parameters<typeof filter>[3] = 'UiAutomator2';
  void [suggestedDriver, complexDriver, filterDriver];
}
