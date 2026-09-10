import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const start = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
const createDefaultServer = jest
  .fn<(...args: unknown[]) => Promise<{start: typeof start}>>()
  .mockResolvedValue({start});
const loadCliPlugins = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]);
const configureStdioTransportLogging = jest.fn();
const log = {info: jest.fn(), error: jest.fn()};

jest.unstable_mockModule('../server.js', () => ({default: createDefaultServer}));
jest.unstable_mockModule('../cli/plugins.js', () => ({loadCliPlugins}));
jest.unstable_mockModule('../logger.js', () => ({default: log, configureStdioTransportLogging}));

const {runCli} = await import('../cli/index.js');

beforeEach(() => {
  jest.clearAllMocks();
  loadCliPlugins.mockResolvedValue([]);
});

describe('CLI server startup', () => {
  test('passes loaded plugins to the stdio server after configuring logging', async () => {
    const plugins = [{name: 'example', version: '1.0.0'}];
    loadCliPlugins.mockResolvedValue(plugins);
    await runCli(['--plugin', './example.mjs']);
    expect(loadCliPlugins).toHaveBeenCalledWith(['--plugin', './example.mjs']);
    expect(createDefaultServer).toHaveBeenCalledWith(plugins);
    expect(start).toHaveBeenCalledWith({transportType: 'stdio'});
    expect(configureStdioTransportLogging.mock.invocationCallOrder[0]).toBeLessThan(
      loadCliPlugins.mock.invocationCallOrder[0],
    );
  });

  test('preserves HTTP transport options with plugin flags', async () => {
    await runCli(['--httpStream', '--port=8123', '--plugin=example-plugin']);
    expect(start).toHaveBeenCalledWith({transportType: 'httpStream', httpStream: {endpoint: '/sse', port: 8123}});
    expect(configureStdioTransportLogging).not.toHaveBeenCalled();
  });

  test('help does not import plugins or start a server', async () => {
    await runCli(['--help', '--plugin', './missing.mjs']);
    expect(loadCliPlugins).not.toHaveBeenCalled();
    expect(createDefaultServer).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('--plugin=<module>'));
  });

  test('a plugin load error stops startup with a failing exit status', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });
    loadCliPlugins.mockRejectedValue(new Error('Failed to load plugin "bad"'));
    try {
      await expect(runCli(['--plugin=bad'])).rejects.toThrow('process exited');
      expect(exit).toHaveBeenCalledWith(1);
      expect(createDefaultServer).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith('Error starting server:', expect.any(Error));
    } finally {
      exit.mockRestore();
    }
  });
});
