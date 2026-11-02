import type {JSONElement} from './source-parsing.js';
import type {DriverName} from './types.js';

export interface FilterOptions {
  query?: string;
  includeTagNames?: string[];
  excludeTagNames?: string[];
  requireAttributes?: string[];
  minAttributeCount?: number;
  fetchableOnly?: boolean;
  clickableOnly?: boolean;
}

/**
 * Determines if an element should be included based on all filter criteria
 */
export function shouldIncludeElement(
  element: JSONElement,
  filters: FilterOptions,
  isNative: boolean,
  automationName: DriverName,
): boolean {
  const {
    query,
    includeTagNames = [],
    excludeTagNames = ['hierarchy'],
    requireAttributes = [],
    minAttributeCount = 0,
    fetchableOnly = false,
    clickableOnly = false,
  } = filters;

  if (!matchesSearchQuery(element, query)) {
    return false;
  }

  if (!matchesTagFilters(element, includeTagNames, excludeTagNames)) {
    return false;
  }

  if (!matchesAttributeFilters(element, requireAttributes, minAttributeCount)) {
    return false;
  }

  if (clickableOnly && element.attributes?.clickable !== 'true') {
    return false;
  }

  if (fetchableOnly && !isInteractableElement(element, isNative, automationName)) {
    return false;
  }

  return true;
}

/** Literal substring matching applies only to this element, never its descendants. */
function matchesSearchQuery(element: JSONElement, query?: string): boolean {
  const search = query?.trim().toLowerCase();
  if (!search) {
    return true;
  }
  return [element.tagName, ...Object.values(element.attributes)].some((value) => value.toLowerCase().includes(search));
}

/**
 * Determines if an element matches the tag name filters
 */
function matchesTagFilters(element: JSONElement, includeTagNames: string[], excludeTagNames: string[]): boolean {
  if (includeTagNames.length > 0 && !includeTagNames.includes(element.tagName)) {
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
  minAttributeCount: number,
): boolean {
  if (requireAttributes.length > 0) {
    const hasRequiredAttr = requireAttributes.some((attr) => element.attributes && element.attributes[attr]);
    if (!hasRequiredAttr) {
      return false;
    }
  }

  if (element.attributes && Object.keys(element.attributes).length < minAttributeCount) {
    return false;
  }

  return true;
}

/**
 * Determines if an element is interactable/fetchable based on platform
 */
function isInteractableElement(element: JSONElement, isNative: boolean, automationName: DriverName): boolean {
  if (!isNative) {
    const tag = element.tagName.toLowerCase();
    const attrs = element.attributes;
    if (tag === 'input' && attrs.type?.toLowerCase() === 'hidden') {
      return false;
    }
    return (
      ['input', 'button', 'select', 'textarea', 'option', 'summary'].includes(tag) ||
      (tag === 'a' && attrs.href !== undefined) ||
      ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'switch', 'slider', 'tab'].includes(attrs.role) ||
      (attrs.contenteditable !== undefined && attrs.contenteditable !== 'false') ||
      (attrs.tabindex !== undefined && Number(attrs.tabindex) >= 0)
    );
  }
  let interactableTags: string[];
  switch (automationName) {
    case 'uiautomator2':
      interactableTags = [
        'EditText',
        'Button',
        'ImageButton',
        'CheckBox',
        'RadioButton',
        'Switch',
        'ToggleButton',
        'TextView',
      ];
      break;
    case 'xcuitest':
      interactableTags = [
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
      break;
    default:
      // Other native drivers use their own XML schemas. Do not require mobile
      // element types or clickable/focusable attributes before generating XPath.
      return true;
  }

  return (
    interactableTags.some((tag) => element.tagName.includes(tag)) ||
    element.attributes?.clickable === 'true' ||
    element.attributes?.focusable === 'true'
  );
}
