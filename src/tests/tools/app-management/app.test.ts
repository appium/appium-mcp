import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockClientSupportsMcpApps = jest.fn(() => false);
const mockIsMcpAppsEnabled = jest.fn(() => true);
const mockList = jest.fn<
  (
    applicationType?: 'User' | 'System',
    sessionId?: string,
    useMcpApps?: boolean,
  ) => Promise<{content: Array<{type: string; text: string}>}>
>(async () => ({content: [{type: 'text', text: 'apps'}]}));

jest.unstable_mockModule('../../../ui/mcp-apps.js', () => ({
  MCP_APP_MIME_TYPE: 'text/html;profile=mcp-app',
  clientSupportsMcpApps: mockClientSupportsMcpApps,
  isMcpAppsEnabled: mockIsMcpAppsEnabled,
}));

jest.unstable_mockModule('../../../tools/app-management/list-apps.js', () => ({
  list: mockList,
  listAppsFromDevice: jest.fn(),
}));

const {default: registerAppLifecycle} = await import('../../../tools/app-management/app.js');

describe('appium_app_lifecycle MCP Apps response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReturnValue(true);
  });

  test('routes list results to the static control center for MCP Apps clients', async () => {
    mockClientSupportsMcpApps.mockReturnValue(true);
    const tool = registerTool();

    await tool.execute({action: 'list', applicationType: 'System', sessionId: 'session-b'}, {sessionId: 'client'});

    expect(tool._meta).toEqual({ui: {resourceUri: 'ui://appium-mcp/control-center'}});
    expect(mockList).toHaveBeenCalledWith('System', 'session-b', true);
  });

  test('keeps the embedded list fallback for other clients', async () => {
    await registerTool().execute({action: 'list'}, undefined);

    expect(mockList).toHaveBeenCalledWith(undefined, undefined, false);
  });
});

function registerTool(): any {
  let definition: any;
  registerAppLifecycle({
    addTool(tool: any) {
      definition = tool;
    },
    sessions: [],
  } as any);
  return definition;
}
