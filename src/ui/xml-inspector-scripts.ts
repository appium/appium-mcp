/** Shared browser helpers embedded by both inspector transports. Keep these scripts data-free. */
export const XML_FORMAT_SCRIPT = String.raw`
function formatXml(source) {
  const documentNode = new DOMParser().parseFromString(source, 'text/xml');
  if (!documentNode.documentElement || documentNode.getElementsByTagName('parsererror').length) {
    throw new Error('Invalid XML');
  }

  function indentElement(element, depth) {
    // Whitespace can be meaningful in mixed content, CDATA and preserved subtrees.
    if (element.getAttribute('xml:space') === 'preserve') return;
    const children = Array.from(element.childNodes);
    const hasText = children.some(child =>
      child.nodeType === 4 || (child.nodeType === 3 && (child.nodeValue || '').trim())
    );
    if (hasText || !children.some(child => child.nodeType === 1)) return;
    for (const child of children) {
      if (child.nodeType === 3) {
        element.removeChild(child);
        continue;
      }
      if (child.nodeType === 1) indentElement(child, depth + 1);
      element.insertBefore(documentNode.createTextNode('\n' + '  '.repeat(depth + 1)), child);
    }
    element.appendChild(documentNode.createTextNode('\n' + '  '.repeat(depth)));
  }

  indentElement(documentNode.documentElement, 0);
  const serializer = new XMLSerializer();
  let formatted = Array.from(documentNode.childNodes)
    .filter(node => node.nodeType !== 3)
    .map(node => serializer.serializeToString(node))
    .join('\n');
  const declaration = source.match(/^\s*(<\?xml\s[^?]*\?>)/);
  if (declaration && !formatted.startsWith('<?xml ')) {
    formatted = declaration[1] + '\n' + formatted;
  }
  return formatted;
}
`;

export const XML_SEARCH_SCRIPT = String.raw`
function createXmlSearch(container, status) {
  let matches = [];
  let activeIndex = -1;

  function render(text, query) {
    container.textContent = '';
    matches = [];
    activeIndex = -1;
    query = query.trim();
    status.textContent = '';
    if (!query) {
      container.textContent = text;
      return;
    }
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let position = 0;
    while (position < text.length) {
      const index = lowerText.indexOf(lowerQuery, position);
      if (index === -1) break;
      container.appendChild(document.createTextNode(text.slice(position, index)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(index, index + query.length);
      container.appendChild(mark);
      matches.push(mark);
      position = index + query.length;
    }
    container.appendChild(document.createTextNode(text.slice(position)));
    status.textContent = matches.length ? matches.length + ' matches · Enter / Shift+Enter to navigate' : 'No matches';
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (!matches.length) return;
    if (activeIndex >= 0) matches[activeIndex].removeAttribute('data-active');
    const step = event.shiftKey ? -1 : 1;
    activeIndex = activeIndex < 0
      ? (event.shiftKey ? matches.length - 1 : 0)
      : (activeIndex + step + matches.length) % matches.length;
    const match = matches[activeIndex];
    match.setAttribute('data-active', 'true');
    match.scrollIntoView({block: 'nearest', inline: 'nearest'});
    status.textContent = (activeIndex + 1) + ' / ' + matches.length + ' · Enter / Shift+Enter to navigate';
  }

  return {render, handleKeyDown};
}
`;
