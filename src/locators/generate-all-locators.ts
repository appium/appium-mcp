// Standalone Node.js script to generate locators for all elements from sourceXML
// Using existing functions from src/locators directory

import { getSuggestedLocators } from './locator-generation.js';
import { xmlToJSON, JSONElement } from './source-parsing.js';
import { shouldIncludeElement, FilterOptions } from './element-filter.js';
import * as fs from 'fs';
import log from '../logger.js';

export interface ElementWithLocators {
  tagName: string;
  locators: Record<string, string>;
  text: string;
  contentDesc: string;
  resourceId: string;
  clickable: boolean;
  enabled: boolean;
  displayed: boolean;
}

/**
 * Transforms a JSONElement with locators into ElementWithLocators format
 */
function transformElementWithLocators(
  element: JSONElement,
  locators: [string, string][]
): ElementWithLocators {
  // Filter out any undefined or invalid entries before converting to object
  const validLocators = locators.filter(
    (locator): locator is [string, string] =>
      Array.isArray(locator) &&
      locator.length === 2 &&
      typeof locator[0] === 'string' &&
      typeof locator[1] === 'string'
  );

  return {
    tagName: element.tagName,
    locators: Object.fromEntries(validLocators),
    text: element.attributes.text || '',
    contentDesc: element.attributes['content-desc'] || '',
    resourceId: element.attributes['resource-id'] || '',
    clickable: element.attributes.clickable === 'true',
    enabled: element.attributes.enabled === 'true',
    displayed: element.attributes.displayed === 'true',
  };
}

/**
 * Processes a single element: generates locators if it passes filters
 */
function processElement(
  element: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
  filters: FilterOptions,
  results: ElementWithLocators[]
): void {
  if (!shouldIncludeElement(element, filters, isNative, automationName)) {
    return;
  }

  try {
    const strategyMap = getSuggestedLocators(
      element,
      sourceXML,
      isNative,
      automationName
    );
    results.push(transformElementWithLocators(element, strategyMap));
  } catch (error) {
    log.error(
      `Error generating locators for element at path ${element.path}:`,
      error
    );
  }
}

/**
 * Recursively traverses the element tree and processes each element
 */
function traverseAndProcessElements(
  element: JSONElement | null,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
  filters: FilterOptions,
  results: ElementWithLocators[]
): void {
  if (!element) {
    return;
  }

  // Process current element
  processElement(
    element,
    sourceXML,
    isNative,
    automationName,
    filters,
    results
  );

  // Recursively process children (even if parent was filtered out)
  if (element.children && element.children.length > 0) {
    element.children.forEach((child) =>
      traverseAndProcessElements(
        child,
        sourceXML,
        isNative,
        automationName,
        filters,
        results
      )
    );
  }
}

/**
 * Main function to generate locators for all elements from sourceXML
 *
 * @param sourceXML - The XML page source to process
 * @param isNative - Whether this is a native context
 * @param automationName - The automation driver name (uiautomator2, xcuitest, etc.)
 * @param filters - Optional filters to apply when selecting elements
 * @returns Array of elements with their generated locators
 */
export function generateAllElementLocators(
  sourceXML: string,
  isNative: boolean = true,
  automationName: string,
  filters: FilterOptions = {}
): ElementWithLocators[] {
  const sourceJSON = xmlToJSON(sourceXML);
  const results: ElementWithLocators[] = [];

  if (sourceJSON) {
    traverseAndProcessElements(
      sourceJSON,
      sourceXML,
      isNative,
      automationName,
      filters,
      results
    );
  }

  return results;
}
