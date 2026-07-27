import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockGetPageSource = jest.fn(async () => '<hierarchy><node/></hierarchy>');
const mockClientSupportsMcpApps = jest.fn(() => false);
const mockIsMcpAppsEnabled = jest.fn(() => true);
const mockCreatePageSourceInspectorUI = jest.fn((_pageSource: string) => '<html>legacy inspector</html>');
const mockCreateUIResource = jest.fn((_uri: string, text: string) => ({
  type: 'resource',
  resource: {uri: 'ui://legacy', mimeType: 'text/html', text},
}));
const mockAddUIResourceToResponse = jest.fn((response: any, factory: () => unknown) => ({
  content: [...response.content, factory()],
}));

jest.unstable_mockModule('../../../command.js', () => ({
  getPageSource: mockGetPageSource,
}));

jest.unstable_mockModule('../../../ui/mcp-apps.js', () => ({
  MCP_APP_MIME_TYPE: 'text/html;profile=mcp-app',
  clientSupportsMcpApps: mockClientSupportsMcpApps,
  isMcpAppsEnabled: mockIsMcpAppsEnabled,
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  addUIResourceToResponse: mockAddUIResourceToResponse,
  createPageSourceInspectorUI: mockCreatePageSourceInspectorUI,
  createUIResource: mockCreateUIResource,
}));

jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  resolveDriver: jest.fn(async () => ({ok: true, driver: {}})),
  textResult: jest.fn((text: string) => ({content: [{type: 'text', text}]})),
  errorResult: jest.fn((text: string) => ({content: [{type: 'text', text}], isError: true})),
  toolErrorMessage: jest.fn((error: unknown) => String(error)),
}));

const {default: registerGetPageSource} = await import('../../../tools/interactions/get-page-source.js');

function registerTool(): {
  execute: (args: {sessionId?: string}, context?: Record<string, unknown>) => Promise<any>;
  _meta?: unknown;
} {
  let definition: any;
  const server = {
    addTool(tool: any) {
      definition = tool;
    },
    sessions: [],
  };
  registerGetPageSource(server as any);
  return definition;
}

describe('appium_get_page_source MCP Apps response', () => {
  beforeEach(() => {
    mockGetPageSource.mockClear();
    mockClientSupportsMcpApps.mockReset();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReset();
    mockIsMcpAppsEnabled.mockReturnValue(true);
    mockCreatePageSourceInspectorUI.mockClear();
    mockCreateUIResource.mockClear();
    mockAddUIResourceToResponse.mockClear();
  });

  test('returns one XML copy when the client supports MCP Apps', async () => {
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    const result = await tool.execute({}, {});

    expect(tool._meta).toEqual({
      ui: {resourceUri: 'ui://appium-mcp/page-source-inspector'},
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('<hierarchy><node/></hierarchy>');
    expect(mockAddUIResourceToResponse).not.toHaveBeenCalled();
    expect(mockCreatePageSourceInspectorUI).not.toHaveBeenCalled();
  });

  test('keeps the embedded inspector fallback for other clients', async () => {
    const tool = registerTool();

    const result = await tool.execute({}, {});

    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toMatchObject({type: 'resource'});
    expect(mockAddUIResourceToResponse).toHaveBeenCalledTimes(1);
    expect(mockCreatePageSourceInspectorUI).toHaveBeenCalledWith('<hierarchy><node/></hierarchy>');
  });

  test('omits MCP Apps metadata and forces the embedded fallback when disabled', async () => {
    mockIsMcpAppsEnabled.mockReturnValue(false);
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    const result = await tool.execute({}, {});

    expect(tool._meta).toBeUndefined();
    expect(result.content).toHaveLength(2);
    expect(mockAddUIResourceToResponse).toHaveBeenCalledTimes(1);
    expect(mockCreatePageSourceInspectorUI).toHaveBeenCalledWith('<hierarchy><node/></hierarchy>');
  });
});
