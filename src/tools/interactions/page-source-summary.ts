import {DOMParser} from '@xmldom/xmldom';
import type {Element, Node} from '@xmldom/xmldom';
import xpath from 'xpath';

const MAX_NODES = 100;
const FIELDS = [
  'type',
  'class',
  'name',
  'label',
  'value',
  'text',
  'resource-id',
  'content-desc',
  'visible',
  'displayed',
  'bounds',
  'x',
  'y',
  'width',
  'height',
];

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as Node).nodeType === 1;
}

function summarize(node: Element): Record<string, string> {
  const result: Record<string, string> = {
    type: node.getAttribute('type') || node.getAttribute('class') || node.tagName,
  };
  for (const field of FIELDS) {
    const value = node.getAttribute(field);
    if (value !== null) {
      result[field] = value;
    }
  }
  return result;
}

/** Bounded node summaries; a pattern is a literal substring, never an executable expression. */
export function summarizePageSource(source: string, selector?: string, pattern?: string) {
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') {
        throw new Error(message);
      }
    },
  }).parseFromString(source, 'text/xml');
  const selection = xpath.select(selector || '//*', document as never);
  if (!Array.isArray(selection) || selection.some((node) => !isElement(node))) {
    throw new Error('selector must be an XPath selecting elements');
  }
  const selected = (selection as unknown as Element[]).filter(
    (node) =>
      pattern === undefined ||
      [node.tagName, ...Array.from(node.attributes).map((attr) => attr.value)].some((value) => value.includes(pattern)),
  );
  let remaining = MAX_NODES;
  let truncated = false;
  const matches = [];
  for (const node of selected) {
    if (remaining === 0) {
      truncated = true;
      break;
    }
    remaining--;
    const visibleSiblings = [];
    for (const sibling of Array.from(node.parentNode?.childNodes ?? [])) {
      if (!isElement(sibling) || sibling === node) {
        continue;
      }
      const visible = sibling.getAttribute('visible') ?? sibling.getAttribute('displayed');
      if (visible !== 'true' && visible !== '1') {
        continue;
      }
      if (remaining === 0) {
        truncated = true;
        break;
      }
      remaining--;
      visibleSiblings.push(summarize(sibling));
    }
    matches.push({node: summarize(node), visibleSiblings});
  }
  return {matches, truncated};
}
