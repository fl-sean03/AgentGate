import { describe, it, expect } from 'vitest';

function hello(): string {
  return 'Hello, World!';
}

describe('hello', () => {
  it('should return greeting', () => {
    expect(hello()).toBe('Hello, World!');
  });
});
