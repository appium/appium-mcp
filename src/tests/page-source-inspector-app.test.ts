import {runInNewContext} from 'node:vm';

import {expect, jest, test} from '@jest/globals';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

import {createPageSourceInspectorAppUI} from '../ui/page-source-inspector-app.js';

function inspector() {
  const dom = new DOMParser().parseFromString('<ui><pre/></ui>', 'text/xml');
  const output = Object.assign(dom.getElementsByTagName('pre')[0], {classList: {toggle() {}}});
  const events = new Map<string, (event?: unknown) => void>();
  const search = {
    value: '',
    addEventListener: (event: string, handler: () => void) => events.set('searchBox:' + event, handler),
  };
  let onMessage: (event: unknown) => void = () => {};
  const parent = {postMessage: jest.fn()};
  const controls = new Map<
    string,
    {textContent?: string | null; disabled?: boolean; hidden?: boolean; value?: string}
  >();
  const alert = jest.fn();
  const scroll = jest.fn();
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
        if (!controls.has(id)) {
          controls.set(id, ['locatorOutput', 'screenshotElement'].includes(id) ? dom.createElement('div') : {});
        }
        return Object.assign(controls.get(id) ?? {}, {
          addEventListener: (event: string, handler: () => void) => events.set(id + ':' + event, handler),
        });
      },
      createTextNode: (text: string) => dom.createTextNode(text),
      createElement: (name: string) => Object.assign(dom.createElement(name), {scrollIntoView: scroll}),
    },
  });
  return {
    output,
    search,
    alert,
    controls,
    sent: parent.postMessage,
    scroll,
    enter: (shiftKey = false, isComposing = false) => {
      const event = {key: 'Enter', shiftKey, isComposing, preventDefault: jest.fn()};
      events.get('searchBox:keydown')?.(event);
      return event;
    },
    generate: () => events.get('generateButton:click')?.(),
    reply: (result: unknown, error?: unknown) => {
      const request = parent.postMessage.mock.calls.at(-1)?.[0] as {id: number};
      onMessage({source: parent, data: {jsonrpc: '2.0', id: request.id, result, error}});
    },
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

test('shows generated locators without changing the XML or search', async () => {
  const ui = inspector();
  ui.receive('<root/>');
  ui.search.value = 'Calendar';
  const pending = ui.generate();
  expect(ui.sent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'tools/call',
      params: {name: 'generate_locators', arguments: {query: 'Calendar'}},
    }),
    '*',
  );
  expect(ui.controls.get('generateButton')?.disabled).toBe(true);
  expect(ui.controls.get('locatorResults')?.hidden).toBe(false);
  const elements = [{tagName: 'Button', locators: {xpath: '//Button'}}];
  ui.reply({content: [{type: 'text', text: JSON.stringify({interactableElements: elements})}]});
  await pending;
  expect(ui.controls.get('locatorOutput')?.textContent).toContain('1. Button');
  expect(ui.controls.get('locatorOutput')?.textContent).toContain('//Button');
  expect(ui.controls.get('generateButton')?.disabled).toBe(false);
  expect(ui.output.textContent).toBe('<root/>');
  expect(ui.search.value).toBe('Calendar');
  expect(ui.controls.get('locatorStatus')?.textContent).toContain('for “Calendar”');
});

test.each([
  {result: {isError: true, content: [{type: 'text', text: 'No active session'}]}},
  {result: {}, error: {message: 'Permission denied'}},
  {result: {content: [{type: 'text', text: 'invalid JSON'}]}},
])('shows tool and protocol errors and enables retry: %j', async ({result, error}) => {
  const ui = inspector();
  const pending = ui.generate();
  ui.reply(result, error);
  await pending;
  expect(ui.controls.get('locatorStatus')?.textContent).toContain('Failed to generate locators:');
  expect(ui.controls.get('generateButton')?.disabled).toBe(false);
});

test('shows an explicit empty result', async () => {
  const ui = inspector();
  const pending = ui.generate();
  ui.reply({content: [{type: 'text', text: '{"interactableElements":[]}'}]});
  await pending;
  expect(ui.controls.get('locatorStatus')?.textContent).toBe('No supported elements found in the fetched XML.');
});

test('Enter and Shift+Enter navigate matches, wrap, and reset after search or source changes', () => {
  const ui = inspector();
  const xml = '<root><node name="Calendar"/><node name="calendar"/></root>';
  ui.receive(xml);
  ui.search.value = 'Calendar';
  ui.searchChanged();
  const marks = ui.output.getElementsByTagName('mark');
  expect(ui.controls.get('searchStatus')?.textContent).toContain('2 matches');
  expect(ui.enter().preventDefault).toHaveBeenCalled();
  expect(marks[0].getAttribute('data-active')).toBe('true');
  ui.enter();
  expect(marks[0].hasAttribute('data-active')).toBe(false);
  expect(marks[1].getAttribute('data-active')).toBe('true');
  expect(ui.controls.get('searchStatus')?.textContent).toContain('2 / 2');
  ui.enter();
  expect(marks[0].getAttribute('data-active')).toBe('true');
  ui.enter(true);
  expect(marks[1].getAttribute('data-active')).toBe('true');
  expect(ui.scroll).toHaveBeenCalledWith({block: 'nearest', inline: 'nearest'});
  expect(ui.output.textContent).toBe(xml);
  expect(ui.sent).toHaveBeenCalledTimes(1); // Only initialization, never locator generation.
  expect(ui.enter(false, true).preventDefault).not.toHaveBeenCalled();
  ui.search.value = 'missing';
  ui.searchChanged();
  ui.enter();
  expect(ui.controls.get('searchStatus')?.textContent).toBe('No matches');
  ui.search.value = '';
  ui.searchChanged();
  expect(ui.controls.get('searchStatus')?.textContent).toBe('');
  expect(ui.output.getElementsByTagName('mark')).toHaveLength(0);
  ui.search.value = 'Calendar';
  ui.searchChanged();
  ui.enter(true);
  expect(ui.controls.get('searchStatus')?.textContent).toContain('2 / 2');
  ui.receive('<root name="Calendar"/>');
  ui.enter();
  expect(ui.controls.get('searchStatus')?.textContent).toContain('1 / 1');
});

test('passes preferred XPath attributes in order and rejects expressions before calling the tool', async () => {
  const ui = inspector();
  ui.search.value = 'Calendar';
  // The input is read when the action runs.
  const pending = ui.generate();
  ui.reply({content: [{type: 'text', text: '{"interactableElements":[]}'}]});
  await pending;
  const input = ui.controls.get('xpathAttributes');
  if (!input) {
    throw new Error('Missing attribute input');
  }
  input.value = ' AutomationId, data-testid, AutomationId ';
  const next = ui.generate();
  expect(ui.sent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      params: {
        name: 'generate_locators',
        arguments: {query: 'Calendar', xpathAttributes: ['AutomationId', 'data-testid']},
      },
    }),
    '*',
  );
  ui.reply({content: [{type: 'text', text: '{"interactableElements":[]}'}]});
  await next;
  const calls = ui.sent.mock.calls.length;
  input.value = 'id] | //*';
  await ui.generate();
  expect(ui.sent).toHaveBeenCalledTimes(calls);
  expect(ui.controls.get('locatorStatus')?.textContent).toContain('attribute names');
});
