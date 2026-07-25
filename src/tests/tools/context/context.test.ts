import { beforeEach, describe, test, expect, jest } from '@jest/globals';

const mockDriver = {};
const mockSetCurrentContext = jest.fn<
  (context: string, sessionId?: string) => boolean
>(() => true);

jest.unstable_mockModule('../../../session-store', () => ({
  setCurrentContext: mockSetCurrentContext,
}));

jest.unstable_mockModule('../../../command', () => ({
  getContexts: jest.fn(async () => ['NATIVE_APP', 'WEBVIEW_com.example']),
  getCurrentContext: jest.fn(async () => 'NATIVE_APP'),
  setContext: jest.fn(async () => undefined),
}));

jest.unstable_mockModule('../../../tools/tool-response', () => ({
  resolveDriver: jest.fn(async () => ({ ok: true, driver: mockDriver })),
  textResult: (text: string) => ({ content: [{ type: 'text', text }] }),
  errorResult: (text: string) => ({
    content: [{ type: 'text', text }],
    isError: true,
  }),
  toolErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils', () => ({
  createUIResource: jest.fn(() => ({})),
  createContextSwitcherUI: jest.fn(() => ''),
  addUIResourceToResponse: jest.fn((_result: unknown) => _result),
}));

const { getCurrentContext } = await import('../../../command.js');

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<
  typeof getCurrentContext
>;

describe('appium_context tool', () => {
  const mockServer = { addTool: jest.fn() } as any;

  async function getToolExecute() {
    const { default: contextTool } =
      await import('../../../tools/context/context.js');
    contextTool(mockServer);
    return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentContext.mockResolvedValue('NATIVE_APP');
  });

  test('setCurrentContext uses sessionId on list', async () => {
    const tool = await getToolExecute();

    await tool.execute({ action: 'list', sessionId: 'session-b' }, undefined);

    expect(mockSetCurrentContext).toHaveBeenCalledWith(
      'NATIVE_APP',
      'session-b'
    );
  });

  test('setCurrentContext uses sessionId on switch', async () => {
    const tool = await getToolExecute();
    mockGetCurrentContext
      .mockResolvedValueOnce('NATIVE_APP')
      .mockResolvedValueOnce('WEBVIEW_com.example');

    await tool.execute(
      {
        action: 'switch',
        context: 'WEBVIEW_com.example',
        sessionId: 'session-b',
      },
      undefined
    );

    expect(mockSetCurrentContext).toHaveBeenLastCalledWith(
      'WEBVIEW_com.example',
      'session-b'
    );
  });
});
