import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../command', () => ({
  getElementRect: jest.fn(),
}));

const { AI_ELEMENT_PREFIX, isAiElementUUID, parseAiElement } =
  await import('../../../tools/gestures/handlers/ai-element.js');

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

  test('falls back to a 1x1 rect at the centre when bbox is missing', () => {
    const result = parseAiElement('ai-element:42,84');
    expect(result).toEqual({
      center: { x: 42, y: 84 },
      rect: { x: 42, y: 84, width: 1, height: 1 },
    });
  });

  test('falls back to 1x1 rect when bbox is malformed', () => {
    const result = parseAiElement('ai-element:10,20:not,a,real,bbox');
    expect(result).toEqual({
      center: { x: 10, y: 20 },
      rect: { x: 10, y: 20, width: 1, height: 1 },
    });
  });

  test('falls back to 1x1 rect when bbox is degenerate (x1<=x0 or y1<=y0)', () => {
    expect(parseAiElement('ai-element:5,5:10,10,10,20')).toEqual({
      center: { x: 5, y: 5 },
      rect: { x: 5, y: 5, width: 1, height: 1 },
    });
    expect(parseAiElement('ai-element:5,5:10,10,20,10')).toEqual({
      center: { x: 5, y: 5 },
      rect: { x: 5, y: 5, width: 1, height: 1 },
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
