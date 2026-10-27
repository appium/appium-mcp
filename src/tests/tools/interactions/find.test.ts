import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockFind = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const driver = {};
const mockFindAll = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetDriver = jest.fn<() => unknown>(() => driver);
jest.unstable_mockModule('../../../command.js', () => ({findElement: mockFind, findElements: mockFindAll}));
jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: mockGetDriver,
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

const {default: registerFindElements} = await import('../../../tools/interactions/find-elements.js');
let pluralTool: any;
registerFindElements({
  addTool: (definition: unknown) => {
    pluralTool = definition;
  },
} as any);

describe('find multiple elements', () => {
  beforeEach(() => {
    mockFindAll.mockReset();
    mockGetDriver.mockReturnValue(driver);
  });
  test('returns every match with its own ID and unchanged attributes', async () => {
    mockFindAll.mockResolvedValue([
      {[w3c]: 'one', label: 'First', enabled: false},
      {ELEMENT: 'two', 'attribute/visible': true},
      'three',
    ]);
    const result = await pluralTool.execute(args);
    expect(JSON.parse(result.content[0].text)).toEqual({
      elements: [
        {elementId: 'one', attributes: {label: 'First', enabled: false}},
        {elementId: 'two', attributes: {'attribute/visible': true}},
        {elementId: 'three'},
      ],
    });
    expect(mockFindAll).toHaveBeenCalledTimes(1);
    expect(mockFindAll).toHaveBeenCalledWith(driver, args.strategy, args.selector);
  });
  test('returns an empty array successfully for no matches', async () => {
    mockFindAll.mockResolvedValue([]);
    expect(await pluralTool.execute(args)).toEqual({content: [{type: 'text', text: '{"elements":[]}'}]});
  });
  test.each([null, {}, [{label: 'missing ID'}]])('rejects malformed driver result %j', async (value) => {
    mockFindAll.mockResolvedValue(value);
    expect((await pluralTool.execute(args)).isError).toBe(true);
  });
  test('does not hide driver failures as empty matches', async () => {
    mockFindAll.mockRejectedValue(new Error('invalid selector'));
    const result = await pluralTool.execute(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid selector');
  });
  test('requires a session without querying the driver', async () => {
    mockGetDriver.mockReturnValue(null);
    expect((await pluralTool.execute(args)).isError).toBe(true);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});

describe('-image locator strategy (@appium/images-plugin)', () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockFindAll.mockReset();
    mockGetDriver.mockReturnValue(driver);
  });

  test('passes raw base64 template image to findElement with -image strategy', async () => {
    const base64Png = Buffer.from('fake-png-bytes').toString('base64');
    mockFind.mockResolvedValue({[w3c]: id});

    const result = await tool.execute({strategy: '-image', selector: base64Png});
    expect(result.isError).toBeFalsy();
    expect(mockFind).toHaveBeenCalledWith(driver, '-image', base64Png);
  });

  test('strips data URI prefix when finding by -image', async () => {
    const base64Png = Buffer.from('fake-png-bytes').toString('base64');
    mockFind.mockResolvedValue({[w3c]: id});

    const result = await tool.execute({
      strategy: '-image',
      selector: `data:image/png;base64,${base64Png}`,
    });
    expect(result.isError).toBeFalsy();
    expect(mockFind).toHaveBeenCalledWith(driver, '-image', base64Png);
  });

  test('reads and base64-encodes a local image file for -image strategy', async () => {
    const tmpFile = path.join(os.tmpdir(), `appium-mcp-image-${Date.now()}.png`);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.promises.writeFile(tmpFile, bytes);
    mockFind.mockResolvedValue({[w3c]: id});
    mockFindAll.mockResolvedValue([{[w3c]: id}]);

    try {
      const single = await tool.execute({strategy: '-image', selector: tmpFile});
      expect(single.isError).toBeFalsy();
      expect(mockFind).toHaveBeenCalledWith(driver, '-image', bytes.toString('base64'));

      const multiple = await pluralTool.execute({strategy: '-image', selector: tmpFile});
      expect(multiple.isError).toBeFalsy();
      expect(mockFindAll).toHaveBeenCalledWith(driver, '-image', bytes.toString('base64'));
    } finally {
      await fs.promises.unlink(tmpFile).catch(() => {});
    }
  });

  test('returns error when a local image file path does not exist', async () => {
    const result = await tool.execute({
      strategy: '-image',
      selector: '/nonexistent/path/template.png',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Image file not found');
    expect(mockFind).not.toHaveBeenCalled();
  });
});
