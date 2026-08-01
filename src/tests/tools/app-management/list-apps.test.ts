import {describe, expect, jest, test} from '@jest/globals';

const apps = [
  {packageName: 'com.example.one', appName: 'One'},
  {packageName: 'com.example.two', appName: 'Two'},
];

jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  resolveDriver: async () => ({ok: true, driver: {}}),
  textResult: (text: string) => ({content: [{type: 'text', text}]}),
  errorResult: (text: string) => ({content: [{type: 'text', text}], isError: true}),
  toolErrorMessage: (error: unknown) => String(error),
}));

jest.unstable_mockModule('../../../session-store.js', () => ({
  getPlatformName: () => 'iOS',
  isRemoteDriverSession: () => true,
  isAndroidUiautomator2DriverSession: () => false,
  isXCUITestDriverSession: () => false,
  PLATFORM: {ios: 'iOS', android: 'Android'},
}));

jest.unstable_mockModule('../../../command.js', () => ({
  execute: async () => ({
    'com.example.one': {CFBundleDisplayName: 'One'},
    'com.example.two': {CFBundleDisplayName: 'Two'},
  }),
}));

const mockCreateAppListUI = jest.fn(() => '<html>legacy app list</html>');

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  addUIResourceToResponse: jest.fn((response: any, factory: () => unknown) => ({
    content: [...response.content, factory()],
  })),
  createAppListUI: mockCreateAppListUI,
  createUIResource: jest.fn((_uri: string, text: string) => ({
    type: 'resource',
    resource: {uri: 'ui://legacy', mimeType: 'text/html', text},
  })),
}));

const {list} = await import('../../../tools/app-management/list-apps.js');

describe('installed app list MCP Apps response', () => {
  test('returns app data without generated HTML for MCP Apps clients', async () => {
    const result = await list('User', 'session-b', true);

    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toEqual({
      appiumMcpView: {
        type: 'app-list',
        apps,
        sessionId: 'session-b',
      },
    });
    expect(mockCreateAppListUI).not.toHaveBeenCalled();
  });
});
