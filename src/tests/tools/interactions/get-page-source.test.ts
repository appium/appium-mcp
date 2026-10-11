import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {afterEach} from '@jest/globals';
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
  execute: (
    args: {sessionId?: string; saveToFile?: boolean; selector?: string; pattern?: string},
    context?: Record<string, unknown>,
  ) => Promise<any>;
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

describe('page source file responses', () => {
  const originalDir = process.env.PAGE_SOURCES_DIR;
  const originalNoUi = process.env.NO_UI;
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'page-source-test-'));
    process.env.PAGE_SOURCES_DIR = directory;
    mockGetPageSource.mockResolvedValue('<root><node name="日本語" visible="true"/></root>');
    mockCreatePageSourceInspectorUI.mockClear();
    mockAddUIResourceToResponse.mockClear();
  });
  afterEach(async () => {
    if (originalDir === undefined) {
      delete process.env.PAGE_SOURCES_DIR;
    } else {
      process.env.PAGE_SOURCES_DIR = originalDir;
    }
    if (originalNoUi === undefined) {
      delete process.env.NO_UI;
    } else {
      process.env.NO_UI = originalNoUi;
    }
    await rm(directory, {recursive: true, force: true});
  });
  test('omitted saveToFile preserves the XML response without writing a file', async () => {
    const result = await registerTool().execute({});
    expect(result.content[0].text).toBe(
      'Page source retrieved successfully: \n```xml <root><node name="日本語" visible="true"/></root>```',
    );
    expect(await readdir(directory)).toEqual([]);
  });
  test('explicit saveToFile=false matches the omitted default', async () => {
    const tool = registerTool();
    expect(await tool.execute({saveToFile: false})).toEqual(await tool.execute({}));
    expect(await readdir(directory)).toEqual([]);
  });
  test.each(['true', 'false'])('writes full XML without embedding XML or HTML when NO_UI=%s', async (noUi) => {
    process.env.NO_UI = noUi;
    const tool = registerTool();
    const result = await tool.execute({saveToFile: true});
    const metadata = JSON.parse(result.content[0].text);
    const xml = await readFile(metadata.filepath, 'utf8');
    expect(xml).toContain('日本語');
    expect(metadata.bytes).toBe(Buffer.byteLength(xml));
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).not.toContain('<root>');
    expect(mockAddUIResourceToResponse).not.toHaveBeenCalled();
    const next = JSON.parse((await tool.execute({saveToFile: true})).content[0].text);
    expect(next.filepath).not.toBe(metadata.filepath);
  });
  test('returns matching summaries alongside the complete saved file', async () => {
    const result = await registerTool().execute({saveToFile: true, pattern: '日本語'});
    const metadata = JSON.parse(result.content[0].text);
    expect(metadata.matches[0].node.name).toBe('日本語');
    expect(metadata.truncated).toBe(false);
    expect(await readFile(metadata.filepath, 'utf8')).toContain('<root>');
  });
  test('rejects filters when file saving is disabled', async () => {
    expect((await registerTool().execute({saveToFile: false, pattern: 'x'})).isError).toBe(true);
  });
  test('reports file write failures', async () => {
    process.env.PAGE_SOURCES_DIR = join(directory, 'not-a-directory');
    const {writeFile} = await import('node:fs/promises');
    await writeFile(process.env.PAGE_SOURCES_DIR, 'file');
    expect((await registerTool().execute({saveToFile: true})).isError).toBe(true);
  });
});
