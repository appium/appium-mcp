import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockGetPageSource = jest.fn(async () => '<hierarchy/>');
const mockGenerateAllElementLocators = jest.fn(() => [
  {
    tagName: 'android.widget.Button',
    locators: {'accessibility id': 'Continue'},
    text: 'Continue',
    contentDesc: 'Continue',
    resourceId: 'button',
    clickable: true,
    enabled: true,
    displayed: true,
  },
]);
const mockClientSupportsMcpApps = jest.fn(() => false);
const mockIsMcpAppsEnabled = jest.fn(() => true);
const mockCreateLocatorGeneratorUI = jest.fn((_elements: unknown[]) => '<html>legacy locators</html>');
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

jest.unstable_mockModule('../../../locators/generate-all-locators.js', () => ({
  generateAllElementLocators: mockGenerateAllElementLocators,
}));

jest.unstable_mockModule('../../../session-store.js', () => ({
  isAndroidUiautomator2DriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
}));

jest.unstable_mockModule('../../../ui/mcp-apps.js', () => ({
  MCP_APP_MIME_TYPE: 'text/html;profile=mcp-app',
  clientSupportsMcpApps: mockClientSupportsMcpApps,
  isMcpAppsEnabled: mockIsMcpAppsEnabled,
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  addUIResourceToResponse: mockAddUIResourceToResponse,
  createLocatorGeneratorUI: mockCreateLocatorGeneratorUI,
  createUIResource: mockCreateUIResource,
}));

jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  resolveDriver: jest.fn(async () => ({
    ok: true,
    driver: {caps: {automationName: 'UiAutomator2'}},
  })),
  textResult: jest.fn((text: string) => ({content: [{type: 'text', text}]})),
  errorResult: jest.fn((text: string) => ({content: [{type: 'text', text}], isError: true})),
  toolErrorMessage: jest.fn((error: unknown) => String(error)),
}));

const {default: registerGenerateLocators} = await import('../../../tools/test-generation/locators.js');

describe('generate_locators MCP Apps response', () => {
  beforeEach(() => {
    mockGetPageSource.mockClear();
    mockGenerateAllElementLocators.mockClear();
    mockClientSupportsMcpApps.mockReset();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReset();
    mockIsMcpAppsEnabled.mockReturnValue(true);
    mockCreateLocatorGeneratorUI.mockClear();
    mockCreateUIResource.mockClear();
    mockAddUIResourceToResponse.mockClear();
  });

  test('returns one locator copy when the client supports MCP Apps', async () => {
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    const result = await tool.execute({}, toolContext());

    expect(tool._meta).toEqual({
      ui: {resourceUri: 'ui://appium-mcp/locator-generator'},
    });
    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0].text).interactableElements).toHaveLength(1);
    expect(mockAddUIResourceToResponse).not.toHaveBeenCalled();
    expect(mockCreateLocatorGeneratorUI).not.toHaveBeenCalled();
  });

  test('keeps the embedded locator viewer fallback for other clients', async () => {
    const tool = registerTool();

    const result = await tool.execute({}, toolContext());

    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toMatchObject({type: 'resource'});
    expect(mockCreateLocatorGeneratorUI).toHaveBeenCalledWith(mockGenerateAllElementLocators());
  });

  test('omits MCP Apps metadata and forces the embedded fallback when disabled', async () => {
    mockIsMcpAppsEnabled.mockReturnValue(false);
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    const result = await tool.execute({}, toolContext());

    expect(tool._meta).toBeUndefined();
    expect(result.content).toHaveLength(2);
    expect(mockAddUIResourceToResponse).toHaveBeenCalledTimes(1);
  });
});

function toolContext() {
  return {
    log: {
      info: jest.fn(),
      error: jest.fn(),
    },
  };
}

function registerTool(): {
  execute: (args: {sessionId?: string}, context: ReturnType<typeof toolContext>) => Promise<any>;
  _meta?: unknown;
} {
  let definition: any;
  const server = {
    addTool(tool: any) {
      definition = tool;
    },
    sessions: [],
  };
  registerGenerateLocators(server as any);
  return definition;
}
