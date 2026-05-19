import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import type { DriverInstance } from '../../../session-store.js';

jest.unstable_mockModule('../../../session-store', () => ({
  listPersistedSessions: jest.fn(() => []),
  removePersistedSession: jest.fn(),
  setSession: jest.fn(),
  getDriver: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../command', () => ({
  getElementRect: jest.fn(),
}));

const {
  AI_ELEMENT_PREFIX,
  isAiElementUUID,
  parseAiElement,
  resolveTargetRect,
} = await import('../../../tools/gestures/handlers/ai-element.js');

const fakeDriver = {} as DriverInstance;

describe('isAiElementUUID', () => {
  test('returns true for ai-element UUIDs', () => {
    expect(isAiElementUUID('ai-element:100,200:50,150,150,250')).toBe(true);
    expect(isAiElementUUID(AI_ELEMENT_PREFIX + '0,0:0,0,1,1')).toBe(true);
  });

  test('returns false for traditional UUIDs and falsy values', () => {
    expect(isAiElementUUID('11111111-2222-3333-4444-555555555555')).toBe(false);
    expect(isAiElementUUID('')).toBe(false);
    expect(isAiElementUUID(undefined)).toBe(false);
  });
});

describe('parseAiElement', () => {
  test('parses centre + bbox into a rect that spans the bbox', () => {
    const result = parseAiElement('ai-element:200,300:100,200,300,400');
    expect(result).toEqual({
      center: { x: 200, y: 300 },
      rect: { x: 100, y: 200, width: 200, height: 200 },
    });
  });

  test('falls back to a centred minimum rect when bbox is missing', () => {
    const result = parseAiElement('ai-element:42,84');
    expect(result).toEqual({
      center: { x: 42, y: 84 },
      rect: { x: -8, y: 34, width: 100, height: 100 },
    });
  });

  test('falls back to a centred minimum rect when bbox is malformed', () => {
    const result = parseAiElement('ai-element:10,20:not,a,real,bbox');
    expect(result).toEqual({
      center: { x: 10, y: 20 },
      rect: { x: -40, y: -30, width: 100, height: 100 },
    });
  });

  test('falls back to centred minimum rect when bbox is degenerate (x1<=x0 or y1<=y0)', () => {
    expect(parseAiElement('ai-element:5,5:10,10,10,20')).toEqual({
      center: { x: 5, y: 5 },
      rect: { x: -45, y: -45, width: 100, height: 100 },
    });
    expect(parseAiElement('ai-element:5,5:10,10,20,10')).toEqual({
      center: { x: 5, y: 5 },
      rect: { x: -45, y: -45, width: 100, height: 100 },
    });
  });

  test('returns an error when the centre segment is missing', () => {
    const result = parseAiElement('ai-element');
    expect(result).toEqual({
      error: 'Invalid ai-element UUID: missing coordinate segment.',
    });
  });

  test('returns an error when centre coordinates are not numbers', () => {
    const result = parseAiElement('ai-element:foo,bar');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/centre coordinates are not numbers/);
    }
  });
});

describe('resolveTargetRect', () => {
  beforeEach(async () => {
    const cmd = await import('../../../command.js');
    jest.mocked(cmd.getElementRect).mockReset();
  });

  test('delegates traditional UUIDs to getElementRect', async () => {
    const cmd = await import('../../../command.js');
    const rect = { x: 3, y: 4, width: 30, height: 40 };
    jest.mocked(cmd.getElementRect).mockResolvedValueOnce(rect);

    await expect(resolveTargetRect(fakeDriver, 'aaaaaaaa-bbbb')).resolves.toBe(
      rect
    );
    const getElMock = jest.mocked(cmd.getElementRect);
    expect(getElMock.mock.calls).toHaveLength(1);
    expect(getElMock.mock.calls[0]?.[1]).toBe('aaaaaaaa-bbbb');
  });

  test('returns { error } when getElementRect rejects', async () => {
    const cmd = await import('../../../command.js');
    jest
      .mocked(cmd.getElementRect)
      .mockRejectedValueOnce(new Error('stale element reference'));

    await expect(
      resolveTargetRect(fakeDriver, 'aaaaaaaa-bbbb')
    ).resolves.toEqual({
      error: 'stale element reference',
    });
  });
});
