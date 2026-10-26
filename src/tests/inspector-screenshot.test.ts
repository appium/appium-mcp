import {runInNewContext} from 'node:vm';

import {expect, jest, test} from '@jest/globals';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

import {INSPECTOR_SCREENSHOT_SCRIPT} from '../ui/inspector-screenshot-script.js';

const xml =
  '<root><node name="iOS" x="10" y="20" width="30" height="40"/><node name="Android" bounds="[10,20][40,60]"/><node name="hidden" x="10" y="20" width="30" height="40" visible="false"/><node name="missing"/><node name="outside" x="200" y="0" width="10" height="10"/></root>';
function preview() {
  const doc = new DOMParser().parseFromString('<root/>', 'text/xml');
  const controls = new Map<string, any>();
  const events = new Map<string, () => Promise<void> | void>();
  const callTool = jest.fn(async (name: string) => {
    if (name === 'appium_get_page_source') {
      return {content: [{type: 'text', text: xml}]};
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
  return {controls, events, callTool, controller: context.controller};
}

test('captures fresh XML, dimensions and image and maps iOS/Android bounds to percentages', async () => {
  const ui = preview();
  await ui.events.get('takeScreenshotButton:click')?.();
  expect(ui.callTool.mock.calls.map((call) => call[0])).toEqual([
    'appium_get_page_source',
    'appium_get_window_size',
    'appium_screenshot',
  ]);
  expect(ui.controls.get('inspectorScreenshot').src).toBe('data:image/png;base64,image-data');
  for (const value of ['2', '3']) {
    ui.controls.get('screenshotElement').value = value;
    await ui.events.get('screenshotElement:change')?.();
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

test('does not highlight hidden, missing-bounds or offscreen elements', async () => {
  const ui = preview();
  await ui.events.get('takeScreenshotButton:click')?.();
  for (const [value, message] of [
    ['4', 'hidden'],
    ['5', 'no usable'],
    ['6', 'outside'],
  ]) {
    ui.controls.get('screenshotElement').value = value;
    await ui.events.get('screenshotElement:change')?.();
    expect(ui.controls.get('elementOverlay').hidden).toBe(true);
    expect(ui.controls.get('screenshotStatus').textContent).toContain(message);
  }
});

test('rejects stale orientation and handles tool failures with retry enabled', async () => {
  const ui = preview();
  await ui.events.get('takeScreenshotButton:click')?.();
  const image = ui.controls.get('inspectorScreenshot');
  image.naturalWidth = 600;
  image.naturalHeight = 300;
  await ui.events.get('inspectorScreenshot:load')?.();
  expect(ui.controls.get('screenshotStatus').textContent).toContain('dimensions differ');
  ui.callTool.mockRejectedValueOnce(new Error('Disconnected'));
  await ui.events.get('takeScreenshotButton:click')?.();
  expect(ui.controls.get('screenshotStatus').textContent).toContain('Disconnected');
  expect(ui.controls.get('takeScreenshotButton').disabled).toBe(false);
  expect(ui.controls.get('elementOverlay').hidden).toBe(true);
});
