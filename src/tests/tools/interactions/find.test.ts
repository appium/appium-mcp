import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockFind = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const driver = {};
jest.unstable_mockModule('../../../command.js', () => ({findElement: mockFind}));
jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: jest.fn(() => driver),
  setSession: jest.fn(),
}));
jest.unstable_mockModule('../../../persistence.js', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(),
}));
jest.unstable_mockModule('../../../tools/evidence.js', () => ({
  evidenceContext: jest.fn(async () => undefined),
  withEvidence: jest.fn((response: unknown) => response),
}));
const {default: registerFind} = await import('../../../tools/interactions/find.js');
let tool: any;
registerFind({
  addTool: (definition: unknown) => {
    tool = definition;
  },
} as any);
const args = {strategy: 'accessibility id', selector: 'menu'};
const id = 'element-id';
const w3c = 'element-6066-11e4-a52e-4f735466cecf';
const originalText = `elementId '${id}'\nSuccessfully found element menu with strategy accessibility id.`;

describe('find response attributes', () => {
  beforeEach(() => {
    mockFind.mockReset();
  });

  test.each([id, {ELEMENT: id}, {[w3c]: id}, {ELEMENT: id, [w3c]: id}])(
    'preserves the compact response for %j',
    async (element) => {
      mockFind.mockResolvedValue(element);
      expect(await tool.execute(args)).toEqual({content: [{type: 'text', text: originalText}]});
    },
  );

  test('preserves driver fields and values without duplicate protocol IDs or extra calls', async () => {
    const attributes = {
      'attribute/name': 'menu',
      label: 'Menu',
      enabled: false,
      'attribute/visible': true,
      rect: {x: 0, y: 0, width: 20, height: 30},
      value: null,
    };
    const element = {ELEMENT: id, [w3c]: id, ...attributes};
    mockFind.mockResolvedValue(element);
    const result = await tool.execute(args);
    expect(result.content[0].text).toBe(originalText);
    expect(result.content).toHaveLength(2);
    expect(JSON.parse(result.content[1].text)).toEqual({elementId: id, attributes});
    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalledWith(driver, args.strategy, args.selector);
    expect(element).toEqual({ELEMENT: id, [w3c]: id, ...attributes});
  });

  test('rejects an attribute response without an element ID', async () => {
    mockFind.mockResolvedValue({label: 'Menu'});
    expect((await tool.execute(args)).isError).toBe(true);
  });

  test('preserves driver errors', async () => {
    mockFind.mockRejectedValue(new Error('no such element'));
    const result = await tool.execute(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no such element');
  });
});
