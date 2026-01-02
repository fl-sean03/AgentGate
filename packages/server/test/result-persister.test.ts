/**
 * ResultPersister unit tests (v0.2.19 - Thrust 2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultPersister } from '../src/orchestrator/result-persister.js';
import { setAgentGateRoot, getRunDir } from '../src/artifacts/paths.js';
import { tmpdir } from 'node:os';
import type { VerificationReport, VerificationLevel, LevelResult, CheckResult, Diagnostic } from '../src/types/verification.js';

describe('ResultPersister', () => {
  let resultPersister: ResultPersister;
  let testRoot: string;
  let testRunId: string;

  beforeEach(async () => {
    resultPersister = new ResultPersister();
    testRoot = join(tmpdir(), `agentgate-test-${randomUUID()}`);
    setAgentGateRoot(testRoot);
    testRunId = randomUUID();
  });

  afterEach(async () => {
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Create a mock verification report for testing.
   */
  function createMockReport(overrides: Partial<VerificationReport> = {}): VerificationReport {
    const defaultLevelResult: LevelResult = {
      level: 'L0' as VerificationLevel,
      passed: true,
      checks: [],
      duration: 1000,
    };

    return {
      id: randomUUID(),
      snapshotId: randomUUID(),
      runId: testRunId,
      iteration: 1,
      passed: true,
      l0Result: { ...defaultLevelResult, level: 'L0' as VerificationLevel },
      l1Result: { ...defaultLevelResult, level: 'L1' as VerificationLevel },
      l2Result: { ...defaultLevelResult, level: 'L2' as VerificationLevel },
      l3Result: { ...defaultLevelResult, level: 'L3' as VerificationLevel },
      logs: '',
      diagnostics: [],
      totalDuration: 4000,
      createdAt: new Date(),
      ...overrides,
    };
  }

  describe('saveVerificationReport', () => {
    it('should save full verification report to disk', async () => {
      const report = createMockReport({
        passed: false,
        l0Result: {
          level: 'L0' as VerificationLevel,
          passed: false,
          checks: [
            { name: 'typecheck', passed: false, message: 'Type errors found', details: 'Error...' }
          ],
          duration: 5000,
        },
      });

      const filePath = await resultPersister.saveVerificationReport(
        testRunId,
        1,
        report,
        { waitForCI: false, skipLevels: ['L2', 'L3'] }
      );

      expect(filePath).toContain('verification-1.json');

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded).not.toBeNull();
      expect(loaded!.passed).toBe(false);
      expect(loaded!.skippedLevels).toContain('L2');
      expect(loaded!.harnessConfig.skipLevels).toContain('L2');
    });

    it('should record skipped levels from config', async () => {
      const report = createMockReport({
        l0Result: {
          level: 'L0' as VerificationLevel,
          passed: true,
          checks: [{ name: 'lint', passed: true, message: null, details: null }],
          duration: 1000,
        },
        l1Result: {
          level: 'L1' as VerificationLevel,
          passed: true,
          checks: [{ name: 'tests', passed: true, message: null, details: null }],
          duration: 2000,
        },
        // L2 and L3 have no checks
        l2Result: { level: 'L2' as VerificationLevel, passed: true, checks: [], duration: 0 },
        l3Result: { level: 'L3' as VerificationLevel, passed: true, checks: [], duration: 0 },
      });

      await resultPersister.saveVerificationReport(
        testRunId,
        1,
        report,
        { skipLevels: ['L2', 'L3'] }
      );

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded!.skippedLevels).toEqual(['L2', 'L3']);
    });

    it('should save report with capturedAt timestamp', async () => {
      const report = createMockReport();

      const beforeSave = new Date();
      await resultPersister.saveVerificationReport(testRunId, 1, report);
      const afterSave = new Date();

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded).not.toBeNull();

      const capturedAt = new Date(loaded!.capturedAt);
      expect(capturedAt.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
      expect(capturedAt.getTime()).toBeLessThanOrEqual(afterSave.getTime());
    });

    it('should save report with default harness config when not provided', async () => {
      const report = createMockReport();

      await resultPersister.saveVerificationReport(testRunId, 1, report);

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded!.harnessConfig).toEqual({
        waitForCI: false,
        skipLevels: [],
      });
    });
  });

  describe('loadVerificationReport', () => {
    it('should return null for non-existent report', async () => {
      const result = await resultPersister.loadVerificationReport(testRunId, 99);
      expect(result).toBeNull();
    });

    it('should reconstruct Date objects', async () => {
      const report = createMockReport({
        createdAt: new Date('2026-01-02T15:35:00.000Z'),
      });

      await resultPersister.saveVerificationReport(testRunId, 1, report);

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded).not.toBeNull();
      expect(loaded!.createdAt).toBeInstanceOf(Date);
      expect(loaded!.createdAt.toISOString()).toBe('2026-01-02T15:35:00.000Z');
    });

    it('should preserve all report fields', async () => {
      const diagnostics: Diagnostic[] = [
        {
          level: 'L0' as VerificationLevel,
          type: 'error',
          message: 'Test error',
          file: 'src/test.ts',
          line: 42,
          column: 5,
        }
      ];

      const report = createMockReport({
        id: 'test-report-id',
        snapshotId: 'test-snapshot-id',
        passed: false,
        logs: 'Some verification logs',
        diagnostics,
        totalDuration: 12345,
      });

      await resultPersister.saveVerificationReport(testRunId, 1, report);

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded!.id).toBe('test-report-id');
      expect(loaded!.snapshotId).toBe('test-snapshot-id');
      expect(loaded!.passed).toBe(false);
      expect(loaded!.logs).toBe('Some verification logs');
      expect(loaded!.diagnostics).toHaveLength(1);
      expect(loaded!.diagnostics[0].message).toBe('Test error');
      expect(loaded!.totalDuration).toBe(12345);
    });
  });

  describe('listVerificationReports', () => {
    it('should list all iterations', async () => {
      const baseReport = createMockReport();

      await resultPersister.saveVerificationReport(testRunId, 1, baseReport);
      await resultPersister.saveVerificationReport(testRunId, 2, { ...baseReport, iteration: 2 });

      const iterations = await resultPersister.listVerificationReports(testRunId);
      expect(iterations).toEqual([1, 2]);
    });

    it('should return sorted iterations', async () => {
      const baseReport = createMockReport();

      // Save in non-sequential order
      await resultPersister.saveVerificationReport(testRunId, 3, { ...baseReport, iteration: 3 });
      await resultPersister.saveVerificationReport(testRunId, 1, baseReport);
      await resultPersister.saveVerificationReport(testRunId, 2, { ...baseReport, iteration: 2 });

      const iterations = await resultPersister.listVerificationReports(testRunId);
      expect(iterations).toEqual([1, 2, 3]);
    });

    it('should return empty array for non-existent run', async () => {
      const iterations = await resultPersister.listVerificationReports('non-existent-run-id');
      expect(iterations).toEqual([]);
    });

    it('should only include verification files', async () => {
      const baseReport = createMockReport();

      await resultPersister.saveVerificationReport(testRunId, 1, baseReport);

      // Create a non-verification file in the run directory
      const runDir = getRunDir(testRunId);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(runDir, 'other-file.json'), '{}');

      const iterations = await resultPersister.listVerificationReports(testRunId);
      expect(iterations).toEqual([1]);
    });
  });

  describe('determineSkippedLevels', () => {
    it('should mark levels without checks as skipped', async () => {
      const report = createMockReport({
        l0Result: {
          level: 'L0' as VerificationLevel,
          passed: true,
          checks: [{ name: 'typecheck', passed: true, message: null, details: null }],
          duration: 1000,
        },
        l1Result: { level: 'L1' as VerificationLevel, passed: true, checks: [], duration: 0 },
        l2Result: { level: 'L2' as VerificationLevel, passed: true, checks: [], duration: 0 },
        l3Result: { level: 'L3' as VerificationLevel, passed: true, checks: [], duration: 0 },
      });

      await resultPersister.saveVerificationReport(testRunId, 1, report);

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      expect(loaded!.skippedLevels).toContain('L1');
      expect(loaded!.skippedLevels).toContain('L2');
      expect(loaded!.skippedLevels).toContain('L3');
      expect(loaded!.skippedLevels).not.toContain('L0');
    });

    it('should include config skip levels', async () => {
      const report = createMockReport({
        l0Result: {
          level: 'L0' as VerificationLevel,
          passed: true,
          checks: [{ name: 'typecheck', passed: true, message: null, details: null }],
          duration: 1000,
        },
        l1Result: {
          level: 'L1' as VerificationLevel,
          passed: true,
          checks: [{ name: 'tests', passed: true, message: null, details: null }],
          duration: 2000,
        },
        l2Result: { level: 'L2' as VerificationLevel, passed: true, checks: [], duration: 0 },
        l3Result: { level: 'L3' as VerificationLevel, passed: true, checks: [], duration: 0 },
      });

      await resultPersister.saveVerificationReport(testRunId, 1, report, { skipLevels: ['L2'] });

      const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
      // L2 should be skipped because it's in config
      expect(loaded!.skippedLevels).toContain('L2');
      // L3 should be skipped because it has no checks
      expect(loaded!.skippedLevels).toContain('L3');
    });
  });
});
