import {runInNewContext} from 'node:vm';

import {expect, jest, test} from '@jest/globals';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

import {INSPECTOR_SCREENSHOT_SCRIPT} from '../ui/inspector-screenshot-script.js';

const xml =
  '<root><node name="iOS" x="10" y="20" width="30" height="40"/><node name="Android" bounds="[10,20][40,60]"/><node name="hidden" x="10" y="20" width="30" height="40" visible="false"/><node name="missing"/><node name="outside" x="200" y="0" width="10" height="10"/></root>';
function preview(source = xml) {
  const doc = new DOMParser().parseFromString('<root/>', 'text/xml');
  const controls = new Map<string, any>();
  const events = new Map<string, () => Promise<void> | void>();
  const callTool = jest.fn(async (name: string) => {
    if (name === 'appium_get_page_source') {
      return {content: [{type: 'text', text: source}]};
    }
    if (name === 'appium_get_window_size') {
      return {content: [{type: 'text', text: 'Width: 100, Height: 200'}]};
    }
    return {content: [{type: 'image', mimeType: 'image/png', data: 'image-data'}]};
  });
  const context: any = {
    DOMParser,
    XMLSerializer,
    callTool,
    document: {
      getElementById(id: string) {
        if (!controls.has(id)) {
          controls.set(
            id,
            Object.assign(doc.createElement('div'), {
              value: '',
              style: {},
              hidden: true,
              addEventListener: (event: string, handler: () => void) => events.set(id + ':' + event, handler),
            }),
          );
        }
        return controls.get(id);
      },
      createElement: (name: string) => doc.createElement(name),
    },
  };
  runInNewContext(
    INSPECTOR_SCREENSHOT_SCRIPT +
      `
    const controller = createScreenshotInspector(callTool, source => controller.updateSource(source), result => result.content[0].text);
    globalThis.controller = controller;
  `,
    context,
  );
  function dispatch(event: string) {
    const handler = events.get(event);
    if (!handler) {
      throw new Error(`Missing event handler: ${event}`);
    }
    return handler();
  }

  return {
    controls,
    callTool,
    controller: context.controller,
    capture: () => dispatch('takeScreenshotButton:click'),
    imageLoaded: () => dispatch('inspectorScreenshot:load'),
    selectElement: (name: string) => {
      const select = controls.get('screenshotElement');
      const options = Array.from(select.getElementsByTagName('option')) as {textContent: string; value: string}[];
      const matches = options.filter((option) => option.textContent.endsWith(' — ' + name));
      if (matches.length !== 1) {
        throw new Error(`Expected one element named "${name}", found ${matches.length}`);
      }
      select.value = matches[0].value;
      return dispatch('screenshotElement:change');
    },
  };
}

test('captures fresh XML, dimensions and image and maps iOS/Android bounds to percentages', async () => {
  const ui = preview();
  await ui.capture();
  expect(ui.callTool.mock.calls.map((call) => call[0])).toEqual([
    'appium_get_page_source',
    'appium_get_window_size',
    'appium_screenshot',
  ]);
  expect(ui.controls.get('inspectorScreenshot').src).toBe('data:image/png;base64,image-data');
  for (const name of ['iOS', 'Android']) {
    await ui.selectElement(name);
    const overlay = ui.controls.get('elementOverlay');
    expect(overlay.hidden).toBe(false);
    expect(overlay.style).toEqual({left: '10%', top: '10%', width: '30%', height: '20%'});
  }
  ui.controller.filter('Android');
  expect(ui.controls.get('screenshotElement').textContent).toContain('Android');
  expect(ui.controls.get('screenshotElement').textContent).not.toContain('iOS');
  ui.controller.updateSource(xml);
  expect(ui.controls.get('elementOverlay').hidden).toBe(true);
  expect(ui.controls.get('inspectorScreenshot').hidden).toBe(true);
});

test.each([
  'X="10" Y="20" Width="30" Height="40"',
  'X="10" y="20" WIDTH="30" hEiGhT="40"',
  'Bounds="[10,20][40,60]"',
  'BOUNDS="[10,20][40,60]"',
  'x="10" X="99" y="20" width="30" height="40"',
])('reads coordinate attributes regardless of casing: %s', async (attributes) => {
  const ui = preview('<node name="target" ' + attributes + '/>');
  await ui.capture();
  await ui.selectElement('target');
  expect(ui.controls.get('elementOverlay').hidden).toBe(false);
  expect(ui.controls.get('elementOverlay').style).toEqual({left: '10%', top: '10%', width: '30%', height: '20%'});
  expect(ui.controls.get('selectedXmlElement').textContent).toContain(attributes);
});

test('does not highlight hidden, missing-bounds or offscreen elements', async () => {
  const ui = preview();
  await ui.capture();
  for (const [name, message] of [
    ['hidden', 'hidden'],
    ['missing', 'no usable'],
    ['outside', 'outside'],
  ]) {
    await ui.selectElement(name);
    expect(ui.controls.get('elementOverlay').hidden).toBe(true);
    expect(ui.controls.get('screenshotStatus').textContent).toContain(message);
  }
});

test('rejects stale orientation and handles tool failures with retry enabled', async () => {
  const ui = preview();
  await ui.capture();
  const image = ui.controls.get('inspectorScreenshot');
  image.naturalWidth = 600;
  image.naturalHeight = 300;
  await ui.imageLoaded();
  expect(ui.controls.get('screenshotStatus').textContent).toContain('dimensions differ');
  ui.callTool.mockRejectedValueOnce(new Error('Disconnected'));
  await ui.capture();
  expect(ui.controls.get('screenshotStatus').textContent).toContain('Disconnected');
  expect(ui.controls.get('takeScreenshotButton').disabled).toBe(false);
  expect(ui.controls.get('elementOverlay').hidden).toBe(true);
});
