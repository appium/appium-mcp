import {describe, test, expect, jest, beforeEach} from '@jest/globals';

jest.unstable_mockModule('../../../persistence.js', () => ({
  isSessionPersistenceEnabled: jest.fn(() => false),
  getPersistenceDir: jest.fn(() => null),
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
  writePersistedSession: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(),
}));

// Simulate a field that keeps its value between calls: setValue appends, clearElement empties.
const fieldValues = new Map<string, string>();
jest.unstable_mockModule('../../../command.js', () => ({
  getElementRect: jest.fn(),
  setValue: jest.fn(async (_driver: unknown, elementUUID: string, text: string) => {
    fieldValues.set(elementUUID, (fieldValues.get(elementUUID) ?? '') + text);
  }),
  clearElement: jest.fn(async (_driver: unknown, elementUUID: string) => {
    fieldValues.set(elementUUID, '');
  }),
}));

const {getDriver} = await import('../../../session-store.js');
const {default: setValueTool} = await import('../../../tools/interactions/set-value.js');

const ELEMENT = '11111111-2222-3333-4444-555555555555';

type Tool = {
  parameters: {safeParse: (v: unknown) => {success: boolean; error?: {issues: Array<{message: string}>}}};
  execute: (args: Record<string, unknown>, ctx: unknown) => Promise<any>;
};

function loadTool(): Tool {
  const mockServer = {addTool: jest.fn()} as any;
  setValueTool(mockServer);
  return mockServer.addTool.mock.calls[0][0];
}

function textOf(result: {content: Array<{type: string; text?: string}>}): string {
  return result.content.map((block) => block.text ?? '').join('\n');
}

describe('appium_set_value clear option', () => {
  beforeEach(() => {
    fieldValues.clear();
    (getDriver as jest.Mock).mockReturnValue({});
  });

  test('set value twice appends, then clear=true with empty text empties the field', async () => {
    const tool = loadTool();

    await tool.execute({elementUUID: ELEMENT, text: 'ASP00052'}, undefined);
    await tool.execute({elementUUID: ELEMENT, text: 'ZZZ99999'}, undefined);
    expect(fieldValues.get(ELEMENT)).toBe('ASP00052ZZZ99999');

    const result = await tool.execute({elementUUID: ELEMENT, text: '', clear: true}, undefined);
    expect(result.isError).toBeUndefined();
    expect(fieldValues.get(ELEMENT)).toBe('');
    expect(textOf(result)).toMatch(/clear/i);
  });

  test('clear=true replaces the existing value with the new text', async () => {
    const tool = loadTool();

    await tool.execute({elementUUID: ELEMENT, text: 'ASP00052'}, undefined);
    await tool.execute({elementUUID: ELEMENT, text: 'ZZZ99999', clear: true}, undefined);

    expect(fieldValues.get(ELEMENT)).toBe('ZZZ99999');
  });

  test('clear=true requires elementUUID', () => {
    const tool = loadTool();
    const parsed = tool.parameters.safeParse({text: 'x', clear: true, w3cActions: true});

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message).join(' ')).toMatch(/elementUUID is required when clear is true/);
  });
});
