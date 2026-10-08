import {describe, expect, jest, test} from '@jest/globals';

// create-session.ts statically imports these appium drivers; mock them so the
// module loads cleanly in tests without real driver binaries.
jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class {},
}));

jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class {},
}));

jest.unstable_mockModule('webdriver', () => ({
  default: {newSession: jest.fn(), attachToSession: jest.fn()},
}));

// appium-webdriveragent transitively loads @appium/base-driver, which calls
// @appium/support.fs.readPackageJsonFrom at import time — not in our mock.
jest.unstable_mockModule('appium-webdriveragent', () => ({
  BOOTSTRAP_PATH: '/mock/wda',
}));

// node-simctl loads asyncbox → p-limit (pure ESM), which fails on older Node.
// prepare-ios-simulator.ts imports Simctl directly, so mock the package itself.
jest.unstable_mockModule('node-simctl', () => ({
  Simctl: class {},
}));

// adb-manager and ios-manager wrap native CLI tools; mock them to keep the
// test portable across environments without ADB or simctl installed.
jest.unstable_mockModule('../../devicemanager/adb-manager', () => ({
  ADBManager: {getInstance: jest.fn()},
}));

jest.unstable_mockModule('../../devicemanager/ios-manager', () => ({
  IOSManager: {getInstance: jest.fn()},
}));

const {default: registerTools} = await import('../../tools/index.js');

// Update this list when a tool is added, removed, or renamed — that is the
// point of this test.
const EXPECTED_TOOL_NAMES = [
  // Session / Device
  'select_device',
  'appium_session_management',
  'appium_mobile_device_control',
  'appium_geolocation',
  'appium_mobile_device_info',
  'appium_mobile_file',
  'appium_driver_settings',
  // iOS Setup
  'prepare_ios_simulator',
  'appium_prepare_ios_real_device',
  // Gestures
  'appium_gesture',
  'appium_drag_and_drop',
  'appium_perform_actions',
  // Element Interactions
  'appium_find_element',
  'appium_mobile_press_key',
  'appium_set_value',
  'appium_mobile_keyboard',
  'appium_get_text',
  'appium_get_element_attribute',
  'appium_mobile_clipboard',
  'appium_get_active_element',
  'appium_get_page_source',
  'appium_orientation',
  'appium_alert',
  'appium_screenshot',
  'appium_get_window_size',
  'appium_screen_recording',
  // App Management
  'appium_app_lifecycle',
  'appium_mobile_permissions',
  // Context
  'appium_context',
  // Test Generation
  'generate_locators',
  'appium_generate_tests',
  // appium_ai is intentionally absent — gated by AI_VISION_ENABLED env var
];

describe('registered MCP tool names', () => {
  test('matches expected set', () => {
    const names: string[] = [];
    const mockServer = {
      addTool: ({name}: {name: string}) => {
        names.push(name);
      },
    };

    registerTools(mockServer as any);

    expect(names.sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });
});

describe('unknown tool arguments', () => {
  function registeredTools(): Array<{name: string; parameters?: any}> {
    const tools: Array<{name: string; parameters?: any}> = [];
    registerTools({addTool: (def: {name: string; parameters?: any}) => tools.push(def)} as any);
    return tools;
  }

  function registeredTool(name: string): {name: string; parameters?: any} {
    const tool = registeredTools().find((t) => t.name === name);
    if (!tool) {
      throw new Error(`${name} is not registered`);
    }
    return tool;
  }

  test('every tool rejects an argument its schema does not declare', async () => {
    const permissive: string[] = [];
    for (const tool of registeredTools()) {
      const parsed = await tool.parameters['~standard'].validate({notARealArgument: true});
      const messages = (parsed.issues ?? []).map((issue: {message: string}) => issue.message).join(' ');
      if (!messages.includes('notARealArgument')) {
        permissive.push(tool.name);
      }
    }
    expect(permissive).toEqual([]);
  });

  test('appium_set_value names the unknown key and the accepted arguments', async () => {
    const parsed = await registeredTool('appium_set_value').parameters['~standard'].validate({
      elementUUID: 'el',
      text: 'ZZZ99999',
      replace: true,
    });

    expect(parsed.issues).toBeDefined();
    const message = parsed.issues.map((issue: {message: string}) => issue.message).join(' ');
    expect(message).toContain('Unknown argument "replace"');
    expect(message).toContain('elementUUID, text, w3cActions, clear, sessionId');
  });

  test('declared arguments still validate', async () => {
    const parsed = await registeredTool('appium_session_management').parameters['~standard'].validate({
      action: 'create',
      platform: 'general',
      capabilities: '{"platformName":"Windows","appium:app":"Root"}',
      remoteServerUrl: 'http://localhost:4723',
    });

    expect(parsed.issues).toBeUndefined();
  });
});
