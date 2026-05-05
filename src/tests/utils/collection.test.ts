import { describe, expect, test } from '@jest/globals';
import { isEmpty, isNil, omitNilValues } from '../../utils/collection.js';

describe('collection utilities', () => {
  describe('isNil', () => {
    test('returns true for null and undefined', () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    test('returns false for non-nil values', () => {
      expect(isNil('')).toBe(false);
      expect(isNil(0)).toBe(false);
      expect(isNil(false)).toBe(false);
    });
  });

  describe('isEmpty', () => {
    test('returns true for nullish values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    test('handles strings and arrays', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('a')).toBe(false);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty([1])).toBe(false);
    });

    test('handles objects and array-like objects', () => {
      expect(isEmpty({})).toBe(true);
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty({ length: 0 })).toBe(true);
      expect(isEmpty({ length: 2, 0: 'x' })).toBe(false);
    });

    test('handles maps and sets by size', () => {
      expect(isEmpty(new Map())).toBe(true);
      expect(isEmpty(new Map([['k', 'v']]))).toBe(false);
      expect(isEmpty(new Set())).toBe(true);
      expect(isEmpty(new Set([1]))).toBe(false);
    });

    test('treats primitives and functions as empty', () => {
      expect(isEmpty(true)).toBe(true);
      expect(isEmpty(false)).toBe(true);
      expect(isEmpty(1)).toBe(true);
      expect(isEmpty(Symbol('x'))).toBe(true);
      expect(isEmpty(() => {})).toBe(true);
    });
  });

  describe('omitNilValues', () => {
    test('omits null and undefined while preserving other values', () => {
      const result = omitNilValues({
        a: 'x',
        b: null,
        c: undefined,
        d: '',
      });

      expect(result).toEqual({ a: 'x', d: '' });
    });

    test('works with non-string value types', () => {
      const result = omitNilValues({
        count: 1,
        optionalCount: undefined,
        enabled: false,
        maybeEnabled: null,
      });

      expect(result).toEqual({ count: 1, enabled: false });
    });
  });
});
