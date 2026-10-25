import {runInNewContext} from 'node:vm';

import {expect, jest, test} from '@jest/globals';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

import {createPageSourceInspectorAppUI} from '../ui/page-source-inspector-app.js';

function inspector() {
  const dom = new DOMParser().parseFromString('<ui><pre/></ui>', 'text/xml');
  const output = Object.assign(dom.getElementsByTagName('pre')[0], {classList: {toggle() {}}});
  const events = new Map<string, () => void>();
  const search = {
    value: '',
    addEventListener: (event: string, handler: () => void) => events.set('searchBox:' + event, handler),
  };
  let onMessage: (event: unknown) => void = () => {};
  const parent = {postMessage() {}};
  const alert = jest.fn();
  runInNewContext(createPageSourceInspectorAppUI().match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '', {
    DOMParser,
    XMLSerializer,
    window: {
      parent,
      alert,
      addEventListener: (_event: string, handler: typeof onMessage) => {
        onMessage = handler;
      },
    },
    document: {
      getElementById: (id: string) => {
        if (id === 'xmlContent') {
          return output;
        }
        if (id === 'searchBox') {
          return search;
        }
        return {addEventListener: (event: string, handler: () => void) => events.set(id + ':' + event, handler)};
      },
      createTextNode: (text: string) => dom.createTextNode(text),
      createElement: (name: string) => dom.createElement(name),
    },
  });
  return {
    output,
    search,
    alert,
    format: () => events.get('formatButton:click')?.(),
    searchChanged: () => events.get('searchBox:input')?.(),
    receive: (xml: string) =>
      onMessage({
        source: parent,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: {
            content: [{type: 'text', text: 'Page source retrieved successfully: \n```xml ' + xml + '```'}],
          },
        },
      }),
  };
}

test('formats only on button click, preserves search, and resets to raw XML on a new result', () => {
  const ui = inspector();
  const xml = '<?xml version="1.0"?><root><group><node/></group></root>';
  ui.receive(xml);
  expect(ui.output.textContent).toBe(xml);
  ui.search.value = 'node';
  ui.format();
  const formatted = '<?xml version="1.0"?>\n<root>\n  <group>\n    <node/>\n  </group>\n</root>';
  expect(ui.output.textContent).toBe(formatted);
  expect(ui.output.getElementsByTagName('mark')).toHaveLength(1);
  ui.search.value = '';
  ui.searchChanged();
  expect(ui.output.textContent).toBe(formatted);
  ui.format();
  expect(ui.output.textContent).toBe(formatted);
  ui.receive(xml);
  expect(ui.output.textContent).toBe(xml);
  expect(ui.alert).not.toHaveBeenCalled();
});

test('preserves mixed content, CDATA, and xml:space subtrees', () => {
  const ui = inspector();
  const children = [
    '<label>Hello <b>world</b>!</label>',
    '<data><![CDATA[a<b>]]><node/></data>',
    '<group xml:space="preserve"><nested><node/></nested>  </group>',
  ];
  ui.receive('<root>' + children.join('') + '</root>');
  ui.format();
  expect(ui.output.textContent).toBe('<root>\n  ' + children.join('\n  ') + '\n</root>');
});

test('keeps the displayed source when parsing fails', () => {
  const ui = inspector();
  ui.receive('not XML');
  ui.format();
  expect(ui.output.textContent).toBe('not XML');
  expect(ui.alert).toHaveBeenCalledWith('Failed to format XML');
});
