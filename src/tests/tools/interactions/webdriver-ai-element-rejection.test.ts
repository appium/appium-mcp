import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: jest.fn(),
}));

jest.unstable_mockModule('../../../command.js', () => ({
  getElementRect: jest.fn(),
  setValue: jest.fn(),
  getElementText: jest.fn(),
  getElementAttribute: jest.fn(),
}));

const { getDriver } = await import('../../../session-store.js');
const { setValue, getElementText, getElementAttribute } =
  await import('../../../command.js');
const { AI_WEBDRIVER_REJECTION } =
  await import('../../../tools/gestures/handlers/ai-element.js');

const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockSetValue = setValue as jest.MockedFunction<typeof setValue>;
const mockGetElementText = getElementText as jest.MockedFunction<
  typeof getElementText
>;
const mockGetElementAttribute = getElementAttribute as jest.MockedFunction<
  typeof getElementAttribute
>;

const AI_UUID = 'ai-element:100,200:50,150,150,250';
const REAL_UUID = '11111111-2222-3333-4444-555555555555';

function textFromResult(result: {
  content: Array<{ type: string; text?: string }>;
}): string | undefined {
  const block = result.content[0];
  return block && 'text' in block ? block.text : undefined;
}

describe('interaction tools and ai-element tokens', () => {
  const mockServer = { addTool: jest.fn() } as any;

  beforeEach(() => {
    mockGetDriver.mockReturnValue({} as any);
    mockSetValue.mockReset();
    mockGetElementText.mockReset();
    mockGetElementAttribute.mockReset();
  });

  async function loadTool(
    modulePath: string
  ): Promise<{ execute: (...args: any[]) => Promise<any> }> {
    const mod = await import(modulePath);
    mod.default(mockServer);
    return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
  }

  async function runTool(
    tool: { execute: (...args: any[]) => Promise<any> },
    args: Record<string, unknown>
  ) {
    return tool.execute(args, undefined);
  }

  test('set_value rejects ai-element without w3cActions', async () => {
    const tool = await loadTool('../../../tools/interactions/set-value.js');
    const result = await runTool(tool, { elementUUID: AI_UUID, text: 'hello' });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toBe(AI_WEBDRIVER_REJECTION);
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  test('set_value still works with w3cActions', async () => {
    const tool = await loadTool('../../../tools/interactions/set-value.js');
    mockSetValue.mockResolvedValueOnce(undefined);
    const result = await runTool(tool, {
      elementUUID: AI_UUID,
      text: 'hello',
      w3cActions: true,
    });

    expect(result.isError).toBeUndefined();
    expect(mockSetValue).toHaveBeenCalled();
  });

  test('set_value accepts a normal element id', async () => {
    const tool = await loadTool('../../../tools/interactions/set-value.js');
    mockSetValue.mockResolvedValueOnce(undefined);
    const result = await runTool(tool, {
      elementUUID: REAL_UUID,
      text: 'hello',
    });

    expect(result.isError).toBeUndefined();
    expect(mockSetValue).toHaveBeenCalledWith(
      expect.anything(),
      REAL_UUID,
      'hello',
      undefined
    );
  });

  test('get_text rejects ai-element', async () => {
    const tool = await loadTool('../../../tools/interactions/get-text.js');
    const result = await runTool(tool, { elementUUID: AI_UUID });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toBe(AI_WEBDRIVER_REJECTION);
    expect(mockGetElementText).not.toHaveBeenCalled();
  });

  test('get_element_attribute rejects ai-element', async () => {
    const tool = await loadTool(
      '../../../tools/interactions/get-element-attribute.js'
    );
    const result = await runTool(tool, {
      elementUUID: AI_UUID,
      attribute: 'enabled',
    });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toBe(AI_WEBDRIVER_REJECTION);
    expect(mockGetElementAttribute).not.toHaveBeenCalled();
  });
});
