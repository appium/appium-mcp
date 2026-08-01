import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockClientSupportsMcpApps = jest.fn(() => false);
const mockIsMcpAppsEnabled = jest.fn(() => true);
const mockDevices = [
  {name: 'Pixel One', udid: 'emulator-5554', state: 'device', type: 'emulator'},
  {name: 'Pixel Two', udid: 'emulator-5556', state: 'device', type: 'emulator'},
];

jest.unstable_mockModule('../../../devicemanager/adb-manager.js', () => ({
  ADBManager: {
    getInstance: () => ({
      initialize: async () => ({getConnectedDevices: async () => mockDevices}),
    }),
  },
}));

jest.unstable_mockModule('../../../devicemanager/ios-manager.js', () => ({
  IOSManager: {
    getInstance: () => ({
      isMac: () => true,
      getDevicesByType: async () => [],
    }),
  },
}));

jest.unstable_mockModule('../../../logger.js', () => ({
  default: {info: jest.fn(), error: jest.fn()},
}));

jest.unstable_mockModule('../../../ui/mcp-apps.js', () => ({
  MCP_APP_MIME_TYPE: 'text/html;profile=mcp-app',
  clientSupportsMcpApps: mockClientSupportsMcpApps,
  isMcpAppsEnabled: mockIsMcpAppsEnabled,
}));

const mockCreateDevicePickerUI = jest.fn<(...args: unknown[]) => string>(() => '<html>legacy device picker</html>');
const mockAddUIResourceToResponse = jest.fn((response: any, factory: () => unknown) => ({
  content: [...response.content, factory()],
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  addUIResourceToResponse: mockAddUIResourceToResponse,
  createDevicePickerUI: mockCreateDevicePickerUI,
  createUIResource: jest.fn((_uri: string, text: string) => ({
    type: 'resource',
    resource: {uri: 'ui://legacy', mimeType: 'text/html', text},
  })),
}));

jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  textResult: (text: string) => ({content: [{type: 'text', text}]}),
  errorResult: (text: string) => ({content: [{type: 'text', text}], isError: true}),
  toolErrorMessage: (error: unknown) => String(error),
}));

const {default: registerSelectDevice} = await import('../../../tools/session/select-device.js');

describe('select_device MCP Apps response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReturnValue(true);
  });

  test('returns device data without generated HTML for MCP Apps clients', async () => {
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    const result = await tool.execute({platform: 'android'}, {sessionId: 'client'});

    expect(tool._meta).toEqual({ui: {resourceUri: 'ui://appium-mcp/control-center'}});
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toEqual({
      appiumMcpView: {
        type: 'device-picker',
        platform: 'android',
        devices: mockDevices,
      },
    });
    expect(mockCreateDevicePickerUI).not.toHaveBeenCalled();
  });

  test('keeps the embedded device picker fallback for other clients', async () => {
    const result = await registerTool().execute({platform: 'android'}, undefined);

    expect(result.content).toHaveLength(2);
    expect(mockCreateDevicePickerUI).toHaveBeenCalledWith(mockDevices, 'android');
  });
});

function registerTool(): any {
  let definition: any;
  registerSelectDevice({
    addTool(tool: any) {
      definition = tool;
    },
    sessions: [],
  });
  return definition;
}
