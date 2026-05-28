import { describe, expect, jest, test } from '@jest/globals';

const createAppiumMcpServer = jest.fn();

await jest.unstable_mockModule('../create-server', () => ({
  createAppiumMcpServer,
}));

await jest.unstable_mockModule('../plugins/appium-screenshot', () => ({
  AppiumScreenshotPlugin: class MockAppiumScreenshotPlugin {
    readonly name = 'appium-screenshot';
    readonly version = '1.0.0';
  },
}));

describe('default server composition', () => {
  test('adds appium_screenshot through createAppiumMcpServer plugins', async () => {
    const mockServer = {};
    createAppiumMcpServer.mockReturnValue(mockServer);

    const module = await import('../server.js');

    expect(module.default).toBe(mockServer);
    expect(createAppiumMcpServer).toHaveBeenCalledWith({
      plugins: [
        {
          name: 'appium-screenshot',
          version: '1.0.0',
        },
      ],
    });
  });
});
