/**
 * Execution Coordinator Unit Tests
 *
 * Note: The ExecutionCoordinator is a high-level orchestrator that integrates
 * many subsystems. Full integration testing requires a running environment.
 * These tests validate the coordinator's interface and basic behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  createExecutionCoordinator,
  type ExecutionCoordinator,
} from '../src/execution/coordinator.js';

describe('ExecutionCoordinator', () => {
  describe('factory', () => {
    it('should create an execution coordinator instance', () => {
      const coordinator = createExecutionCoordinator();
      expect(coordinator).toBeDefined();
      expect(typeof coordinator.execute).toBe('function');
      expect(typeof coordinator.stop).toBe('function');
      expect(typeof coordinator.isRunning).toBe('function');
    });
  });

  describe('isRunning', () => {
    it('should return false when not running', () => {
      const coordinator = createExecutionCoordinator();
      expect(coordinator.isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should be callable even when not running', async () => {
      const coordinator = createExecutionCoordinator();
      // Should not throw
      await expect(coordinator.stop('Test stop')).resolves.not.toThrow();
    });
  });
});
