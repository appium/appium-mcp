import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

import {generateAllElementLocators} from '../locators/generate-all-locators.js';
import {safeDeleteSession, setSession} from '../session-store.js';
import generateLocators from '../tools/test-generation/locators.js';

const html =
  '<html><body><div id="layout"/><input id="email" name="email" type="email"/>' +
  '<button id="submit" name="submit">Submit</button><a href="/help" id="help">Help</a>' +
  '<input type="hidden" id="token"/><div role="button" id="custom"/></body></html>';
let originalNoUI: string | undefined;
beforeEach(() => {
  originalNoUI = process.env.NO_UI;
  process.env.NO_UI = 'true';
});
afterEach(async () => {
  await safeDeleteSession('webview-locators-test');
  if (originalNoUI === undefined) {
    delete process.env.NO_UI;
  } else {
    process.env.NO_UI = originalNoUI;
  }
});

describe('web locator generation', () => {
  test('includes HTML controls and excludes non-interactive containers and hidden inputs', () => {
    const elements = generateAllElementLocators(html, false, 'uiautomator2', {fetchableOnly: true});
    expect(elements.map((element) => element.locators.id)).toEqual(['email', 'submit', 'help', 'custom']);
    expect(elements[0].locators).not.toHaveProperty('class name');
    for (const element of elements) {
      expect(element.locators).not.toHaveProperty('accessibility id');
      expect(element.locators).not.toHaveProperty('-android uiautomator');
      expect(element.locators).not.toHaveProperty('-ios predicate string');
      expect(element.locators.xpath).toBeDefined();
    }
  });

  test.each(['UiAutomator2', 'XCUITest'])(
    'reads the live %s context before generating locators',
    async (automationName) => {
      let currentContext = 'WEBVIEW_app';
      let source = html;
      const driver = {
        sessionId: 'webview-locators-test',
        capabilities: {'appium:automationName': automationName},
        getAppiumContext: jest.fn(async () => currentContext),
        getPageSource: jest.fn(async () => source),
        deleteSession: jest.fn(async () => {}),
      };
      await setSession(driver as never, driver.sessionId);
      let tool: any;
      generateLocators({
        addTool: (definition: unknown) => {
          tool = definition;
        },
      } as never);
      const context = {log: {info: jest.fn(), error: jest.fn()}};
      const webResult = await tool.execute({sessionId: driver.sessionId}, context);
      expect(webResult.isError).toBeFalsy();
      expect(JSON.parse(webResult.content[0].text).interactableElements).toHaveLength(4);

      currentContext = 'NATIVE_APP';
      source =
        automationName === 'UiAutomator2'
          ? '<hierarchy><android.widget.Button content-desc="native"/></hierarchy>'
          : '<XCUIElementTypeApplication><XCUIElementTypeButton name="native"/></XCUIElementTypeApplication>';
      const nativeResult = await tool.execute({sessionId: driver.sessionId}, context);
      expect(nativeResult.isError).toBeFalsy();
      const nativeElements = JSON.parse(nativeResult.content[0].text).interactableElements;
      expect(nativeElements).toHaveLength(1);
      expect(nativeElements[0].locators['accessibility id']).toBe('native');
      expect(driver.getAppiumContext).toHaveBeenCalledTimes(2);
    },
  );
});
