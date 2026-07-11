import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../persistence.js', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(),
  getPlatformName: jest.fn(() => 'Android'),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../command.js', () => ({
  elementClick: jest.fn(async () => {}),
  execute: jest.fn(async () => {}),
  findElement: jest.fn(),
  getPageSource: jest.fn(async () => '<hierarchy/>'),
}));

jest.unstable_mockModule('../../../locators/generate-all-locators.js', () => ({
  generateAllElementLocators: jest.fn(() => [
    {
      text: 'OK',
      contentDesc: 'OK',
      clickable: true,
      locators: { 'accessibility id': 'OK' },
    },
  ]),
}));

const { getDriver } = await import('../../../session-store.js');
const { elementClick, findElement } = await import('../../../command.js');

const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockElementClick = elementClick as jest.MockedFunction<
  typeof elementClick
>;
const mockFindElement = findElement as jest.MockedFunction<typeof findElement>;

// A remote WebDriver client resolves a missing element as this object instead
// of throwing; the raw driver.findElement path would treat it as a real hit.
const SWALLOWED_NO_SUCH_ELEMENT = {
  error: 'no such element',
  message: 'An element could not be located on the page',
};

const mockServer = { addTool: jest.fn() } as any;

async function loadTool(): Promise<{
  execute: (...args: any[]) => Promise<any>;
}> {
  const mod = await import('../../../tools/interactions/handle-alert.js');
  mod.default(mockServer);
  return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
    -1
  )?.[0];
}

function textFromResult(result: {
  content: Array<{ type: string; text?: string }>;
}): string | undefined {
  const block = result.content[0];
  return block && 'text' in block ? block.text : undefined;
}

describe('appium_alert Android custom button', () => {
  beforeEach(() => {
    mockGetDriver.mockReturnValue({
      findElement: jest.fn(async () => SWALLOWED_NO_SUCH_ELEMENT),
    } as any);
    mockElementClick.mockReset();
    mockFindElement.mockReset();
  });

  test('does not click when findElement re-throws a swallowed remote error', async () => {
    // command.findElement surfaces the W3C "no such element" a remote client
    // otherwise resolves silently, so the locator loop must treat it as a miss.
    mockFindElement.mockRejectedValue(
      Object.assign(new Error('no such element'), { name: 'no such element' })
    );

    const tool = await loadTool();
    const result = await tool.execute(
      { action: 'accept', buttonLabel: 'OK' },
      undefined
    );

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toContain('Could not find element');
    expect(mockElementClick).not.toHaveBeenCalled();
  });

  test('clicks the resolved element when findElement succeeds', async () => {
    mockFindElement.mockResolvedValue({
      'element-6066-11e4-a52e-4f735466cecf': 'el-1',
    });

    const tool = await loadTool();
    const result = await tool.execute(
      { action: 'accept', buttonLabel: 'OK' },
      undefined
    );

    expect(result.isError).toBeFalsy();
    expect(mockElementClick).toHaveBeenCalledTimes(1);
  });
});
