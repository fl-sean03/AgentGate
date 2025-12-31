import { describe, it, expect } from 'vitest';
import {
  RunStatus,
  IterationStatus,
  listRunsQuerySchema,
} from '../src/types/run.js';

describe('Run Types', () => {
  describe('RunStatus', () => {
    it('should have all expected status values', () => {
      expect(RunStatus.QUEUED).toBe('queued');
      expect(RunStatus.BUILDING).toBe('building');
      expect(RunStatus.RUNNING).toBe('running');
      expect(RunStatus.SUCCEEDED).toBe('succeeded');
      expect(RunStatus.FAILED).toBe('failed');
      expect(RunStatus.CANCELED).toBe('canceled');
    });

    it('should have exactly 6 statuses', () => {
      const statuses = Object.values(RunStatus);
      expect(statuses).toHaveLength(6);
    });

    it('should identify terminal statuses', () => {
      const terminalStatuses = [
        RunStatus.SUCCEEDED,
        RunStatus.FAILED,
        RunStatus.CANCELED,
      ];

      for (const status of terminalStatuses) {
        expect([RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED])
          .toContain(status);
      }
    });

    it('should identify non-terminal statuses', () => {
      const nonTerminalStatuses = [
        RunStatus.QUEUED,
        RunStatus.BUILDING,
        RunStatus.RUNNING,
      ];

      for (const status of nonTerminalStatuses) {
        expect([RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED])
          .not.toContain(status);
      }
    });
  });

  describe('IterationStatus', () => {
    it('should have all expected status values', () => {
      expect(IterationStatus.PENDING).toBe('pending');
      expect(IterationStatus.RUNNING).toBe('running');
      expect(IterationStatus.COMPLETED).toBe('completed');
      expect(IterationStatus.FAILED).toBe('failed');
    });

    it('should have exactly 4 statuses', () => {
      const statuses = Object.values(IterationStatus);
      expect(statuses).toHaveLength(4);
    });

    it('should identify terminal iteration statuses', () => {
      const terminalStatuses = [
        IterationStatus.COMPLETED,
        IterationStatus.FAILED,
      ];

      for (const status of terminalStatuses) {
        expect([IterationStatus.COMPLETED, IterationStatus.FAILED])
          .toContain(status);
      }
    });

    it('should identify non-terminal iteration statuses', () => {
      const nonTerminalStatuses = [
        IterationStatus.PENDING,
        IterationStatus.RUNNING,
      ];

      for (const status of nonTerminalStatuses) {
        expect([IterationStatus.COMPLETED, IterationStatus.FAILED])
          .not.toContain(status);
      }
    });
  });

  describe('listRunsQuerySchema', () => {
    it('should accept valid query with all parameters', () => {
      const result = listRunsQuerySchema.safeParse({
        workOrderId: 'wo-123',
        status: 'running',
        limit: 10,
        offset: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workOrderId).toBe('wo-123');
        expect(result.data.status).toBe('running');
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });

    it('should use defaults when not provided', () => {
      const result = listRunsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.workOrderId).toBeUndefined();
        expect(result.data.status).toBeUndefined();
      }
    });

    it('should accept all valid status values', () => {
      const statuses = ['queued', 'building', 'running', 'succeeded', 'failed', 'canceled'];
      for (const status of statuses) {
        const result = listRunsQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = listRunsQuerySchema.safeParse({
        status: 'invalid-status',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional workOrderId', () => {
      const result = listRunsQuerySchema.safeParse({
        workOrderId: 'wo-456',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workOrderId).toBe('wo-456');
      }
    });

    it('should coerce string limit to number', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: '15',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(15);
      }
    });

    it('should coerce string offset to number', () => {
      const result = listRunsQuerySchema.safeParse({
        offset: '25',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(25);
      }
    });

    it('should reject negative limit', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero limit', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should accept limit of exactly 100', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: 100,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('should reject negative offset', () => {
      const result = listRunsQuerySchema.safeParse({
        offset: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept offset of zero', () => {
      const result = listRunsQuerySchema.safeParse({
        offset: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(0);
      }
    });

    it('should reject floating point limit', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: 10.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric string limit', () => {
      const result = listRunsQuerySchema.safeParse({
        limit: 'abc',
      });
      expect(result.success).toBe(false);
    });

    it('should combine all filters correctly', () => {
      const result = listRunsQuerySchema.safeParse({
        workOrderId: 'wo-789',
        status: 'succeeded',
        limit: 50,
        offset: 100,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workOrderId).toBe('wo-789');
        expect(result.data.status).toBe('succeeded');
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(100);
      }
    });
  });
});
