/**
 * Tests for math utility functions.
 */

import { describe, it, expect } from 'vitest';
import { add } from '../../src/utils/math.js';

describe('Math Utilities', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add two negative numbers', () => {
      expect(add(-2, -3)).toBe(-5);
    });

    it('should add a positive and negative number', () => {
      expect(add(-1, 1)).toBe(0);
    });

    it('should handle zero', () => {
      expect(add(0, 5)).toBe(5);
      expect(add(5, 0)).toBe(5);
      expect(add(0, 0)).toBe(0);
    });

    it('should handle decimal numbers', () => {
      expect(add(0.1, 0.2)).toBeCloseTo(0.3);
    });

    it('should handle large numbers', () => {
      expect(add(1000000, 2000000)).toBe(3000000);
    });
  });
});
