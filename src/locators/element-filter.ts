import { JSONElement } from './source-parsing.js';

export interface FilterOptions {
  includeTagNames?: string[];
  excludeTagNames?: string[];
  requireAttributes?: string[];
  minAttributeCount?: number;
  fetchableOnly?: boolean;
  clickableOnly?: boolean;
}

/**
 * Determines if an element matches the tag name filters
 */
function matchesTagFilters(
  element: JSONElement,
  includeTagNames: string[],
  excludeTagNames: string[]
): boolean {
  if (
    includeTagNames.length > 0 &&
    !includeTagNames.includes(element.tagName)
  ) {
    return false;
  }
  if (excludeTagNames.includes(element.tagName)) {
    return false;
  }
  return true;
}

/**
 * Determines if an element matches attribute-based filters
 */
function matchesAttributeFilters(
  element: JSONElement,
  requireAttributes: string[],
  minAttributeCount: number
): boolean {
  if (requireAttributes.length > 0) {
    const hasRequiredAttr = requireAttributes.some(
      (attr) => element.attributes && element.attributes[attr]
    );
    if (!hasRequiredAttr) {
      return false;
    }
  }

  if (
    element.attributes &&
    Object.keys(element.attributes).length < minAttributeCount
  ) {
    return false;
  }

  return true;
}

/**
 * Determines if an element is interactable/fetchable based on platform
 */
function isInteractableElement(
  element: JSONElement,
  isNative: boolean,
  automationName: string
): boolean {
  const interactableTags =
    isNative && automationName === 'uiautomator2'
      ? [
          'EditText',
          'Button',
          'ImageButton',
          'CheckBox',
          'RadioButton',
          'Switch',
          'ToggleButton',
          'TextView',
        ]
      : [
          'XCUIElementTypeTextField',
          'XCUIElementTypeSecureTextField',
          'XCUIElementTypeButton',
          'XCUIElementTypeImage',
          'XCUIElementTypeSwitch',
          'XCUIElementTypeStaticText',
          'XCUIElementTypeTextView',
          'XCUIElementTypeCell',
          'XCUIElementTypeLink',
        ];

  return (
    interactableTags.some((tag) => element.tagName.includes(tag)) ||
    element.attributes?.clickable === 'true' ||
    element.attributes?.focusable === 'true'
  );
}

/**
 * Determines if an element should be included based on all filter criteria
 */
export function shouldIncludeElement(
  element: JSONElement,
  filters: FilterOptions,
  isNative: boolean,
  automationName: string
): boolean {
  const {
    includeTagNames = [],
    excludeTagNames = ['hierarchy'],
    requireAttributes = [],
    minAttributeCount = 0,
    fetchableOnly = false,
    clickableOnly = false,
  } = filters;

  if (!matchesTagFilters(element, includeTagNames, excludeTagNames)) {
    return false;
  }

  if (!matchesAttributeFilters(element, requireAttributes, minAttributeCount)) {
    return false;
  }

  if (clickableOnly && element.attributes?.clickable !== 'true') {
    return false;
  }

  if (
    fetchableOnly &&
    !isInteractableElement(element, isNative, automationName)
  ) {
    return false;
  }

  return true;
}
