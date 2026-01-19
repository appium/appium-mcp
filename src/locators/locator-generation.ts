import _ from 'lodash';
import * as XPath from 'xpath';
const xpathSelect = XPath.select;

import log from '../logger.js';
import {
  childNodesOf,
  domToXML,
  findDOMNodeByPath,
  xmlToDOM,
  JSONElement,
  ElementAttributes,
} from './source-parsing.js';
import {
  Document as XMLDocument,
  Node as XMLNode,
  Element as XMLElement,
} from '@xmldom/xmldom';

// Attributes on nodes that are likely to be unique to the node so we should consider first when
// suggesting xpath locators. These are considered IN ORDER.
const UNIQUE_XPATH_ATTRIBUTES = [
  'name',
  'content-desc',
  'id',
  'resource-id',
  'accessibility-id',
];

// Attributes that we should recommend as a fallback but ideally only in conjunction with other
// attributes
const MAYBE_UNIQUE_XPATH_ATTRIBUTES = ['label', 'text', 'value'];

const CHECKED_CLASS_CHAIN_ATTRIBUTES = ['name', 'label', 'value'];

const CHECKED_PREDICATE_ATTRIBUTES = ['name', 'label', 'value', 'type'];

// Map of element attributes to their UiAutomator syntax, ordered by (likely) decreasing uniqueness
const CHECKED_UIAUTOMATOR_ATTRIBUTES: [string, string][] = [
  ['resource-id', 'resourceId'],
  ['text', 'text'],
  ['content-desc', 'description'],
  ['class', 'className'],
];

// Map of element attributes to their matching simple (optimal) locator strategies
const SIMPLE_STRATEGY_MAPPINGS: [string, string][] = [
  ['name', 'accessibility id'],
  ['content-desc', 'accessibility id'],
  ['id', 'id'],
  ['rntestid', 'id'],
  ['resource-id', 'id'],
  ['class', 'class name'],
  ['type', 'class name'],
];

/**
 * Check whether the provided attribute & value are unique in the source
 */
export function areAttrAndValueUnique(
  attrName: string,
  attrValue: string,
  sourceDoc: XMLDocument
): boolean {
  // If no sourceDoc provided, assume it's unique
  if (!sourceDoc || _.isEmpty(sourceDoc)) {
    return true;
  }
  const result = xpathSelect(
    `//*[@${attrName}="${attrValue.replace(/"/g, '')}"]`,
    sourceDoc as any
  );
  return Array.isArray(result) ? result.length < 2 : false;
}

/**
 * Get suggested selectors for simple locator strategies (which match a specific attribute)
 */
export function getSimpleSuggestedLocators(
  attributes: ElementAttributes,
  sourceDoc: XMLDocument,
  isNative: boolean = true
): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [strategyAlias, strategy] of SIMPLE_STRATEGY_MAPPINGS) {
    // accessibility id is only supported in native context
    if (!(strategy === 'accessibility id' && !isNative)) {
      const value = attributes[strategyAlias];
      if (value && areAttrAndValueUnique(strategyAlias, value, sourceDoc)) {
        res[strategy] = value;
      }
    }
  }
  return res;
}

/**
 * Get suggested selectors for complex locator strategies (multiple attributes, axes, etc.)
 */
export function getComplexSuggestedLocators(
  path: string,
  sourceDoc: XMLDocument,
  isNative: boolean,
  automationName: string
): Record<string, string> {
  const complexLocators: Record<string, string | null> = {};
  const domNode = findDOMNodeByPath(path, sourceDoc);
  if (isNative) {
    switch (automationName) {
      case 'xcuitest':
      case 'mac2': {
        const optimalClassChain = getOptimalClassChain(sourceDoc, domNode);
        complexLocators['-ios class chain'] = optimalClassChain
          ? '**' + optimalClassChain
          : null;
        complexLocators['-ios predicate string'] = getOptimalPredicateString(
          sourceDoc,
          domNode
        );
        break;
      }
      case 'uiautomator2': {
        complexLocators['-android uiautomator'] = getOptimalUiAutomatorSelector(
          sourceDoc,
          domNode,
          path
        );
        break;
      }
    }
  }
  complexLocators.xpath = getOptimalXPath(sourceDoc, domNode);

  // Remove entries for locators where the optimal selector could not be found
  return _.omitBy(complexLocators, _.isNil) as Record<string, string>;
}

/**
 * Get suggested selectors for all locator strategies
 */
export function getSuggestedLocators(
  selectedElement: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string
): [string, string][] {
  const sourceDoc = xmlToDOM(sourceXML);
  const simpleLocators = getSimpleSuggestedLocators(
    selectedElement.attributes,
    sourceDoc,
    isNative
  );
  const complexLocators = getComplexSuggestedLocators(
    selectedElement.path,
    sourceDoc,
    isNative,
    automationName
  );

  // Combine all locators
  const allLocators = { ...simpleLocators, ...complexLocators };

  // Define priority order based on platform preference
  let priorityOrder: string[];

  if (
    isNative &&
    (automationName === 'xcuitest' || automationName === 'mac2')
  ) {
    // iOS priority: Accessibility Id > Predicate > Class Chain > XPath > Class Name
    priorityOrder = [
      'id',
      'accessibility id',
      '-ios predicate string',
      '-ios class chain',
      'xpath',
      'class name',
    ];
  } else if (isNative && automationName === 'uiautomator2') {
    // Android priority: Accessibility Id > UiAutomator > XPath > Class Name
    priorityOrder = [
      'id',
      'accessibility id',
      'xpath',
      '-android uiautomator',
      'class name',
    ];
  } else {
    priorityOrder = ['id', 'class name', 'xpath'];
  }

  // Sort locators by priority order, keeping only available ones
  const sortedLocators: [string, string][] = [];

  // Add locators in priority order
  for (const strategy of priorityOrder) {
    if (allLocators[strategy]) {
      sortedLocators.push([strategy, allLocators[strategy]]);
    }
  }

  // Add any remaining locators that weren't in the priority list (like 'id' for native contexts)
  for (const [strategy, value] of _.toPairs(allLocators)) {
    if (!priorityOrder.includes(strategy)) {
      sortedLocators.push([strategy, value]);
    }
  }

  // Return all valid locators, or empty array if none found
  // Filter out any undefined entries
  return sortedLocators.filter(
    (locator): locator is [string, string] =>
      Array.isArray(locator) &&
      locator.length === 2 &&
      typeof locator[0] === 'string' &&
      typeof locator[1] === 'string' &&
      locator[0] !== undefined &&
      locator[1] !== undefined
  );
}

/**
 * Return information about whether an xpath query results in a unique element, and the non-unique
 * index of the element in the document if not unique
 */
function determineXpathUniqueness(
  xpath: string,
  doc: XMLDocument,
  domNode: XMLNode
): [boolean, number?] {
  let othersWithAttr: XMLNode[] = [];

  // If the XPath does not parse, move to the next unique attribute
  try {
    const result = XPath.select(xpath, doc as any);
    othersWithAttr = Array.isArray(result)
      ? (result as unknown as XMLNode[])
      : [];
  } catch {
    return [false];
  }

  if (othersWithAttr.length > 1) {
    return [false, othersWithAttr.indexOf(domNode)];
  }

  return [true];
}

/**
 * Given an xml doc and a current dom node, try to find a robust xpath selector qualified by
 * key attributes, which is unique in the document (or unique plus index).
 */
function getUniqueXPath(
  doc: XMLDocument,
  domNode: XMLNode,
  attrs: string[] | [string, string][]
): [string | undefined, boolean | undefined] {
  let uniqueXpath: string | undefined, semiUniqueXpath: string | undefined;
  const tagForXpath = domNode.nodeName || '*';
  const isPairs = attrs.length > 0 && _.isArray(attrs[0]);
  const isNodeName = attrs.length === 0;

  // If we're looking for a unique //<nodetype>, return it only if it's actually unique. No
  // semi-uniqueness here!
  if (isNodeName) {
    let xpath = `//${domNode.nodeName}`;
    const [isUnique] = determineXpathUniqueness(xpath, doc, domNode);
    if (isUnique) {
      // even if this node name is unique, if it's the root node, we don't want to refer to it using
      // '//' but rather '/'
      if (!domNode.parentNode?.nodeName) {
        xpath = `/${domNode.nodeName}`;
      }
      return [xpath, true];
    }
    return [undefined, undefined];
  }

  // Otherwise go through our various attributes to look for uniqueness
  for (const attrName of attrs) {
    let xpath: string;
    if (isPairs) {
      const [attr1Name, attr2Name] = attrName as [string, string];
      const attr1Value = (domNode as XMLElement).getAttribute?.(attr1Name);
      const attr2Value = (domNode as XMLElement).getAttribute?.(attr2Name);
      if (!attr1Value || !attr2Value) {
        continue;
      }
      xpath = `//${tagForXpath}[@${attr1Name}="${attr1Value}" and @${attr2Name}="${attr2Value}"]`;
    } else {
      const attrValue = (domNode as XMLElement).getAttribute?.(
        attrName as string
      );
      if (!attrValue) {
        continue;
      }
      xpath = `//${tagForXpath}[@${attrName}="${attrValue}"]`;
    }
    const [isUnique, indexIfNotUnique] = determineXpathUniqueness(
      xpath,
      doc,
      domNode
    );
    if (isUnique) {
      uniqueXpath = xpath;
      break;
    }

    // if the xpath wasn't totally unique it might still be our best bet. Store a less unique
    // version qualified by an index for later in semiUniqueXpath. If we can't find a better
    // unique option down the road, we'll fall back to this
    if (!semiUniqueXpath && !_.isUndefined(indexIfNotUnique)) {
      semiUniqueXpath = `(${xpath})[${indexIfNotUnique + 1}]`;
    }
  }
  if (uniqueXpath) {
    return [uniqueXpath, true];
  }
  if (semiUniqueXpath) {
    return [semiUniqueXpath, false];
  }
  return [undefined, undefined];
}

/**
 * Get an optimal XPath for a Node
 */
export function getOptimalXPath(
  doc: XMLDocument,
  domNode: XMLNode
): string | null {
  try {
    // BASE CASE #1: If this isn't an element, we're above the root, return empty string
    if (!domNode.nodeName || domNode.nodeType !== 1) {
      return '';
    }

    const attrsForPairs = [
      ...UNIQUE_XPATH_ATTRIBUTES,
      ...MAYBE_UNIQUE_XPATH_ATTRIBUTES,
    ];
    const attrPairsPermutations: [string, string][] = attrsForPairs.flatMap(
      (v1, i) =>
        attrsForPairs.slice(i + 1).map((v2) => [v1, v2] as [string, string])
    );

    const cases = [
      // BASE CASE #2: If this node has a unique attribute or content attribute, return an absolute
      // XPath with that attribute
      UNIQUE_XPATH_ATTRIBUTES,

      // BASE CASE #3: If this node has a unique pair of attributes including 'maybe' attributes,
      // return an xpath based on that pair
      attrPairsPermutations,

      // BASE CASE #4: Look for a 'maybe' unique attribute on its own. It's better if we find one
      // of these that's unique in conjunction with another attribute, but if not, that's OK.
      // Better than a hierarchical query.
      MAYBE_UNIQUE_XPATH_ATTRIBUTES,

      // BASE CASE #5: Look to see if the node type is unique in the document
      [],
    ];

    // It's possible that in all of these cases we don't find a truly unique selector. But
    // a selector qualified by attribute with an index attached like //*[@id="foo"][1] is still
    // better than a fully path-based selector. We call this a 'semi unique xpath'
    let semiUniqueXpath: string | undefined;

    // Go through each of our cases and look for selectors for each case in order
    for (const attrs of cases) {
      const [xpath, isFullyUnique] = getUniqueXPath(doc, domNode, attrs);
      if (isFullyUnique) {
        // if we ever encounter an actually unique selector, return it straightaway
        return xpath!;
      } else if (!semiUniqueXpath && xpath) {
        // if we have a semin unique selector, and haven't already captured a semi unique selector,
        // hold onto it for later. If we end up without any unique selectors from any of the cases,
        // then we'll return this. But we want to make sure to return our FIRST instance of a semi
        // unique selector, since it might theoretically be the best.
        semiUniqueXpath = xpath;
      }
    }

    // Once we've gone through all our cases, if we do have a semi unique xpath, send that back
    if (semiUniqueXpath) {
      return semiUniqueXpath;
    }

    // Otherwise fall back to a purely hierarchical expression of this dom node's position in the
    // document as a last resort.
    // First get the relative xpath of this node using tagName
    let xpath = `/${domNode.nodeName}`;

    // If this node has siblings of the same tagName, get the index of this node
    if (domNode.parentNode) {
      // Get the siblings
      const childNodes = Array.prototype.slice
        .call(domNode.parentNode.childNodes, 0)
        .filter(
          (childNode: XMLNode) =>
            childNode.nodeType === 1 && childNode.nodeName === domNode.nodeName
        );

      // If there's more than one sibling, append the index
      if (childNodes.length > 1) {
        const index = childNodes.indexOf(domNode);
        xpath += `[${index + 1}]`;
      }
    }

    // Make a recursive call to this nodes parents and prepend it to this xpath
    return getOptimalXPath(doc, domNode.parentNode!) + xpath;
  } catch (error) {
    // If there's an unexpected exception, abort
    logLocatorError('XPath', error);
    return null;
  }
}

/**
 * Get an optimal class chain for a Node based on the getOptimalXPath method
 */
export function getOptimalClassChain(
  doc: XMLDocument,
  domNode: XMLNode
): string | null {
  try {
    // BASE CASE #1: If this isn't an element, we're above the root, return empty string
    // Also return empty for 'XCUIElementTypeApplication', which cannot be found via class chain
    if (
      !domNode.nodeName ||
      domNode.nodeType !== 1 ||
      domNode.nodeName === 'XCUIElementTypeApplication'
    ) {
      return '';
    }

    // BASE CASE #2: If this node has a unique class chain based on attributes, return it
    let classChain: string, othersWithAttr: XMLNode[];

    for (const attrName of CHECKED_CLASS_CHAIN_ATTRIBUTES) {
      const attrValue = (domNode as XMLElement).getAttribute?.(attrName);
      if (_.isEmpty(attrValue)) {
        continue;
      }
      const xpath = `//${domNode.nodeName || '*'}[@${attrName}="${attrValue}"]`;
      classChain = `/${
        domNode.nodeName || '*'
      }[\`${attrName} == "${attrValue}"\`]`;

      // If the XPath does not parse, move to the next unique attribute
      try {
        const result = xpathSelect(xpath, doc as any);
        othersWithAttr = Array.isArray(result)
          ? (result as unknown as XMLNode[])
          : [];
      } catch {
        continue;
      }

      // If the attribute isn't actually unique, get its index too
      if (othersWithAttr.length > 1) {
        const index = othersWithAttr.indexOf(domNode);
        classChain = `${classChain}[${index + 1}]`;
      }
      return classChain;
    }

    // BASE CASE #3: If this node has no unique attributes, repeat checks for its parent
    // Get the relative xpath of this node using tagName
    classChain = `/${domNode.nodeName}`;

    // If this node has siblings of the same tagName, get the index of this node
    if (domNode.parentNode) {
      // Get the siblings
      const childNodes = Array.prototype.slice
        .call(domNode.parentNode.childNodes, 0)
        .filter(
          (childNode: XMLNode) =>
            childNode.nodeType === 1 && childNode.nodeName === domNode.nodeName
        );

      // If there's more than one sibling, append the index
      if (childNodes.length > 1) {
        const index = childNodes.indexOf(domNode);
        classChain += `[${index + 1}]`;
      }
    }

    // Make a recursive call to this nodes parents and prepend it to this xpath
    return getOptimalClassChain(doc, domNode.parentNode!) + classChain;
  } catch (error) {
    // If there's an unexpected exception, abort
    logLocatorError('class chain', error);
    return null;
  }
}

/**
 * Get an optimal predicate string for a Node based on the getOptimalXPath method
 * Only works for a single element - no parent/child scope
 */
export function getOptimalPredicateString(
  doc: XMLDocument,
  domNode: XMLNode
): string | null {
  try {
    // BASE CASE #1: If this isn't an element, or we're above the root, return empty string
    if (!domNode.nodeName || domNode.nodeType !== 1) {
      return '';
    }

    // BASE CASE #2: Check all attributes and try to find the best way
    const xpathAttributes: string[] = [];
    const predicateString: string[] = [];
    let othersWithAttr: XMLNode[];

    for (const attrName of CHECKED_PREDICATE_ATTRIBUTES) {
      const attrValue = (domNode as XMLElement).getAttribute?.(attrName);
      if (_.isEmpty(attrValue)) {
        continue;
      }

      xpathAttributes.push(`@${attrName}="${attrValue}"`);
      const xpath = `//*[${xpathAttributes.join(' and ')}]`;
      predicateString.push(`${attrName} == "${attrValue}"`);

      // If the XPath does not parse, move to the next attribute
      try {
        const result = xpathSelect(xpath, doc as any);
        othersWithAttr = Array.isArray(result)
          ? (result as unknown as XMLNode[])
          : [];
      } catch {
        continue;
      }

      // Return as soon as the accumulated attribute combination is unique
      if (othersWithAttr.length === 1) {
        return predicateString.join(' AND ');
      }
    }
  } catch (error) {
    // If there's an unexpected exception, abort
    logLocatorError('predicate string', error);
    return null;
  }
  return null;
}

/**
 * Get an optimal UiAutomator selector for a Node
 * Only works for elements inside the last direct child of the hierarchy (xpath: /hierarchy/*[last()] )
 */
export function getOptimalUiAutomatorSelector(
  doc: XMLDocument,
  domNode: XMLNode,
  path: string
): string | null {
  try {
    // BASE CASE #1: If this isn't an element, or we're above the root, return empty string
    if (!domNode.nodeName || domNode.nodeType !== 1) {
      return '';
    }

    // UiAutomator can only find elements inside the last direct child of the hierarchy.
    // hierarchy is the child of doc (which is <xml/>), so need to get the children of its child
    // BASE CASE #2: If there is no hierarchy or its children, return null
    const docChildren = childNodesOf(doc);
    const hierarchyChildren = _.isEmpty(docChildren)
      ? []
      : childNodesOf(docChildren[0]);
    if (_.isEmpty(hierarchyChildren)) {
      return null;
    }

    // BASE CASE #3: If looking for an element that is not inside
    // the last direct child of the hierarchy, return null
    const lastHierarchyChildIndex = (hierarchyChildren.length - 1).toString();
    const pathArray = path.split('.');
    const requestedHierarchyChildIndex = pathArray[0];
    if (requestedHierarchyChildIndex !== lastHierarchyChildIndex) {
      return null;
    }

    // In order to use only the last direct child of the hierarchy as the new scope,
    // need to recreate it as a Document (Node -> XML -> Document),
    // then modify the path by changing the first index,
    // and finally recreate the domNode, since it still references the original parent
    const lastHierarchyChild =
      hierarchyChildren[parseInt(lastHierarchyChildIndex, 10)];
    const newXml = domToXML(lastHierarchyChild);
    // wrap the new XML in a dummy tag which will have the node type Document
    const newDoc = xmlToDOM(`<dummy>${newXml}</dummy>`);
    pathArray[0] = '0';
    const newPath = pathArray.join('.');
    const newDomNode = findDOMNodeByPath(newPath, newDoc);

    // BASE CASE #4: Check all attributes and try to find unique ones
    let uiSelector: string,
      othersWithAttr: XMLNode[],
      othersWithAttrMinCount: number | undefined,
      mostUniqueSelector: string | undefined;

    for (const [attrName, attrTranslation] of CHECKED_UIAUTOMATOR_ATTRIBUTES) {
      const attrValue = (newDomNode as XMLElement).getAttribute?.(attrName);
      if (_.isEmpty(attrValue)) {
        continue;
      }

      const xpath = `//${newDomNode.nodeName}[@${attrName}="${attrValue}"]`;
      uiSelector = `new UiSelector().${attrTranslation}("${attrValue}")`;

      // If the XPath does not parse, move to the next unique attribute
      try {
        const result = xpathSelect(xpath, newDoc as any);
        othersWithAttr = Array.isArray(result)
          ? (result as unknown as XMLNode[])
          : [];
      } catch {
        continue;
      }

      // If the attribute is unique, return it, otherwise save it and add an index,
      // but only if it returns the least number of elements
      if (othersWithAttr.length === 1) {
        return uiSelector;
      } else if (
        !othersWithAttrMinCount ||
        othersWithAttr.length < othersWithAttrMinCount
      ) {
        othersWithAttrMinCount = othersWithAttr.length;
        mostUniqueSelector = `${uiSelector}.instance(${othersWithAttr.indexOf(
          newDomNode
        )})`;
      }
    }

    // BASE CASE #5: Did not find any unique attributes - use the 'most unique' selector
    if (mostUniqueSelector) {
      return mostUniqueSelector;
    }
  } catch (error) {
    // If there's an unexpected exception, abort
    logLocatorError('uiautomator selector', error);
    return null;
  }
  return null;
}

function logLocatorError(strategy: string, error: any): void {
  log.error(
    `The most optimal ${strategy} could not be determined because an error was thrown: '${error}'`
  );
}
