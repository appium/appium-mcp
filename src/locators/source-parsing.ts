import { DOMParser, MIME_TYPE, XMLSerializer } from '@xmldom/xmldom';
import type {
  Document as XMLDocument,
  Node as XMLNode,
  Element as XMLElement,
} from '@xmldom/xmldom';

const domParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

export const xmlToDOM = (string: string): XMLDocument =>
  domParser.parseFromString(string, MIME_TYPE.XML_TEXT);
export const domToXML = (dom: XMLNode): string =>
  xmlSerializer.serializeToString(dom);

interface ElementAttributes {
  [key: string]: string;
}

interface JSONElement {
  children: JSONElement[];
  tagName: string;
  attributes: ElementAttributes;
  path: string;
}

/**
 * Get the child nodes of a Node object
 *
 * @param {XMLNode} domNode
 * @returns {Array<XMLNode>} list of Nodes
 */
export function childNodesOf(domNode: XMLNode): XMLNode[] {
  if (!domNode?.hasChildNodes()) {
    return [];
  }
  return Array.from(domNode.childNodes).filter(
    (childNode) => childNode.nodeType === domNode.ELEMENT_NODE
  );
}

/**
 * Look up an element in the Document source using the provided path
 *
 * @param {string} path a dot-separated string of indices
 * @param {XMLDocument} sourceDoc app source in Document format
 * @returns {XMLNode} element node
 */
export function findDOMNodeByPath(
  path: string,
  sourceDoc: XMLDocument
): XMLNode {
  let selectedElement =
    childNodesOf(sourceDoc)[0] ||
    (sourceDoc.documentElement
      ? childNodesOf(sourceDoc.documentElement)[0]
      : null);
  if (!selectedElement) {
    throw new Error('No element found in document');
  }
  for (const index of path.split('.')) {
    selectedElement = childNodesOf(selectedElement)[parseInt(index, 10)];
  }
  return selectedElement;
}

/**
 * Look up an element in the JSON source using the provided path
 *
 * @param {string} path a dot-separated string of indices
 * @param {JSONElement} sourceJSON app source in JSON format
 * @returns {JSONElement} element details in JSON format
 */
export function findJSONElementByPath(
  path: string,
  sourceJSON: JSONElement
): JSONElement {
  let selectedElement = sourceJSON;
  for (const index of path.split('.')) {
    selectedElement = selectedElement.children[parseInt(index, 10)];
  }
  return { ...selectedElement };
}

/**
 * Translates sourceXML to JSON
 *
 * @param {string} sourceXML
 * @returns {JSONElement} source in JSON format
 */
export function xmlToJSON(sourceXML: string): JSONElement {
  const translateRecursively = (
    domNode: XMLNode,
    parentPath: string = '',
    index: number | null = null
  ): JSONElement => {
    const attributes: ElementAttributes = {};
    if ((domNode as XMLElement).attributes) {
      const elementNode = domNode as XMLElement;
      for (
        let attrIdx = 0;
        attrIdx < elementNode.attributes.length;
        ++attrIdx
      ) {
        const attr = elementNode.attributes.item(attrIdx);
        if (attr) {
          // it should be show new line character(\n) in GUI
          attributes[attr.name] = attr.value.replace(/(\n)/gm, '\\n');
        }
      }
    }

    // Dot Separated path of indices
    const path =
      index == null ? '' : `${!parentPath ? '' : parentPath + '.'}${index}`;

    return {
      children: childNodesOf(domNode).map((childNode, childIndex) =>
        translateRecursively(childNode, path, childIndex)
      ),
      tagName: domNode.nodeName,
      attributes,
      path,
    };
  };

  const sourceDoc = xmlToDOM(sourceXML);
  // get the first child element node in the doc. some drivers write their xml differently so we
  // first try to find an element as a direct descended of the doc, then look for one in
  // documentElement
  const firstChild =
    childNodesOf(sourceDoc)[0] ||
    (sourceDoc.documentElement
      ? childNodesOf(sourceDoc.documentElement)[0]
      : null);

  return firstChild
    ? translateRecursively(firstChild)
    : {
        children: [],
        tagName: '',
        attributes: {},
        path: '',
      };
}

export type { ElementAttributes, JSONElement };
