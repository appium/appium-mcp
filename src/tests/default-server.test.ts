import {beforeEach, describe, expect, jest, test} from '@jest/globals';

import type {AppiumMcpPlugin} from '../core.js';

const documentationPlugin = {name: 'documentation', version: '1.0.0'};
const createAppiumMcpServer = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
const isDocumentationEnabled = jest.fn<() => boolean>().mockReturnValue(false);
const loadDocumentationPlugin = jest.fn<() => Promise<AppiumMcpPlugin | null>>().mockResolvedValue(documentationPlugin);

jest.unstable_mockModule('../create-server.js', () => ({createAppiumMcpServer}));
jest.unstable_mockModule('../documentation.js', () => ({isDocumentationEnabled, loadDocumentationPlugin}));

const {default: createDefaultServer} = await import('../server.js');

beforeEach(() => {
  jest.clearAllMocks();
  isDocumentationEnabled.mockReturnValue(false);
  loadDocumentationPlugin.mockResolvedValue(documentationPlugin);
});

describe('default server plugins', () => {
  test('preserves the default server with no optional plugins', async () => {
    await createDefaultServer();
    expect(createAppiumMcpServer).toHaveBeenCalledWith({plugins: []});
    expect(loadDocumentationPlugin).not.toHaveBeenCalled();
  });

  test('keeps documentation opt-in and registers additional plugins in order', async () => {
    isDocumentationEnabled.mockReturnValue(true);
    const plugins = [
      {name: 'first', version: '1.0.0'},
      {name: 'second', version: '1.0.0'},
    ];
    await createDefaultServer(plugins);
    expect(createAppiumMcpServer).toHaveBeenCalledWith({plugins: [documentationPlugin, ...plugins]});
    expect(plugins).toHaveLength(2);
  });

  test('loads additional plugins even when the optional documentation package is unavailable', async () => {
    isDocumentationEnabled.mockReturnValue(true);
    loadDocumentationPlugin.mockResolvedValue(null);
    const plugins = [{name: 'custom', version: '1.0.0'}];
    await createDefaultServer(plugins);
    expect(createAppiumMcpServer).toHaveBeenCalledWith({plugins});
  });
});
