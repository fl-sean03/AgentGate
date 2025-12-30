/**
 * Main Verifier module.
 * Orchestrates verification across all levels (L0-L3).
 */

import { randomUUID } from 'node:crypto';
import {
  VerificationLevel,
  type GatePlan,
  type VerificationReport,
  type LevelResult,
} from '../types/index.js';
import type { VerifyOptions, VerifyContext } from './types.js';
import { createCleanRoom, teardownCleanRoom } from './clean-room.js';
import { verifyL0 } from './l0-contracts.js';
import { verifyL1 } from './l1-tests.js';
import { verifyL2 } from './l2-blackbox.js';
import { verifyL3 } from './l3-sanity.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('verifier');

/**
 * Default timeout for entire verification (10 minutes).
 */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Extended options for verify function (includes metadata).
 */
export interface VerifyWithMetadataOptions extends VerifyOptions {
  /**
   * Snapshot ID being verified.
   */
  snapshotId?: string;

  /**
   * Run ID for this verification.
   */
  runId?: string;

  /**
   * Iteration number within the run.
   */
  iteration?: number;
}

/**
 * Run full verification on a snapshot.
 * @param options - Verification options
 * @returns Complete verification report
 */
export async function verify(options: VerifyWithMetadataOptions): Promise<VerificationReport> {
  const startTime = Date.now();
  const {
    snapshotPath,
    gatePlan,
    cleanRoom: useCleanRoom = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    skip = [],
    verbose = false,
    snapshotId = 'unknown',
    runId = randomUUID(),
    iteration = 1,
  } = options;

  log.info(
    {
      snapshotPath,
      useCleanRoom,
      timeoutMs,
      skip,
      snapshotId,
      runId,
      iteration,
    },
    'Starting verification'
  );

  // Create verification context
  const ctx: VerifyContext = {
    workDir: snapshotPath,
    gatePlan,
    cleanRoom: null,
    startTime: new Date(),
    timeoutMs,
    results: {
      l0: null,
      l1: null,
      l2: null,
      l3: null,
    },
    diagnostics: [],
  };

  // Log collector for the report
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);
  addLog(`Starting verification of ${snapshotPath}`);

  try {
    // Set up clean-room if requested
    if (useCleanRoom) {
      log.debug('Setting up clean-room environment');
      addLog('Setting up clean-room environment');
      ctx.cleanRoom = await createCleanRoom(snapshotPath, gatePlan, snapshotId);
      ctx.workDir = ctx.cleanRoom.workDir;
      addLog(`Clean-room created at ${ctx.cleanRoom.workDir}`);
    }

    // Run verification levels in order
    // Each level is a gate - if it fails, subsequent levels are skipped

    // L0: Contract checks
    if (!skip.includes(VerificationLevel.L0)) {
      addLog('Running L0 (contract) verification');
      ctx.results.l0 = await verifyL0(ctx);
      addLog(`L0 completed: ${ctx.results.l0.passed ? 'PASSED' : 'FAILED'}`);

      if (!ctx.results.l0.passed) {
        log.info('L0 failed, skipping remaining levels');
        addLog('L0 failed, skipping remaining levels');
        return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'));
      }
    } else {
      ctx.results.l0 = createSkippedResult(VerificationLevel.L0);
      addLog('L0 skipped');
    }

    // Check timeout
    if (isTimedOut(ctx)) {
      log.warn('Verification timed out after L0');
      addLog('Verification timed out after L0');
      return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'), 'Verification timed out');
    }

    // L1: Test commands
    if (!skip.includes(VerificationLevel.L1)) {
      addLog('Running L1 (test) verification');
      ctx.results.l1 = await verifyL1(ctx);
      addLog(`L1 completed: ${ctx.results.l1.passed ? 'PASSED' : 'FAILED'}`);

      if (!ctx.results.l1.passed) {
        log.info('L1 failed, skipping remaining levels');
        addLog('L1 failed, skipping remaining levels');
        return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'));
      }
    } else {
      ctx.results.l1 = createSkippedResult(VerificationLevel.L1);
      addLog('L1 skipped');
    }

    // Check timeout
    if (isTimedOut(ctx)) {
      log.warn('Verification timed out after L1');
      addLog('Verification timed out after L1');
      return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'), 'Verification timed out');
    }

    // L2: Blackbox tests
    if (!skip.includes(VerificationLevel.L2)) {
      addLog('Running L2 (blackbox) verification');
      ctx.results.l2 = await verifyL2(ctx);
      addLog(`L2 completed: ${ctx.results.l2.passed ? 'PASSED' : 'FAILED'}`);

      if (!ctx.results.l2.passed) {
        log.info('L2 failed, skipping remaining levels');
        addLog('L2 failed, skipping remaining levels');
        return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'));
      }
    } else {
      ctx.results.l2 = createSkippedResult(VerificationLevel.L2);
      addLog('L2 skipped');
    }

    // Check timeout
    if (isTimedOut(ctx)) {
      log.warn('Verification timed out after L2');
      addLog('Verification timed out after L2');
      return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'), 'Verification timed out');
    }

    // L3: Sanity checks
    if (!skip.includes(VerificationLevel.L3)) {
      addLog('Running L3 (sanity) verification');
      ctx.results.l3 = await verifyL3(ctx);
      addLog(`L3 completed: ${ctx.results.l3.passed ? 'PASSED' : 'FAILED'}`);
    } else {
      ctx.results.l3 = createSkippedResult(VerificationLevel.L3);
      addLog('L3 skipped');
    }

    addLog('Verification complete');
    return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'));
  } catch (error) {
    log.error({ error }, 'Verification failed with error');
    addLog(`Error: ${error instanceof Error ? error.message : String(error)}`);

    // Add error to diagnostics
    ctx.diagnostics.push({
      level: VerificationLevel.L0,
      type: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
    });

    return buildReport(ctx, startTime, snapshotId, runId, iteration, logs.join('\n'), String(error));
  } finally {
    // Clean up clean-room if created
    if (ctx.cleanRoom) {
      await teardownCleanRoom(ctx.cleanRoom);
    }
  }
}

/**
 * Run a single verification level.
 * @param level - Level to run
 * @param options - Verification options
 * @returns Level result
 */
export async function verifyLevel(
  level: VerificationLevel,
  options: VerifyOptions
): Promise<LevelResult> {
  const ctx: VerifyContext = {
    workDir: options.snapshotPath,
    gatePlan: options.gatePlan,
    cleanRoom: null,
    startTime: new Date(),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    results: { l0: null, l1: null, l2: null, l3: null },
    diagnostics: [],
  };

  try {
    if (options.cleanRoom) {
      ctx.cleanRoom = await createCleanRoom(options.snapshotPath, options.gatePlan);
      ctx.workDir = ctx.cleanRoom.workDir;
    }

    switch (level) {
      case VerificationLevel.L0:
        return await verifyL0(ctx);
      case VerificationLevel.L1:
        return await verifyL1(ctx);
      case VerificationLevel.L2:
        return await verifyL2(ctx);
      case VerificationLevel.L3:
        return await verifyL3(ctx);
      default:
        throw new Error(`Unknown verification level: ${level}`);
    }
  } finally {
    if (ctx.cleanRoom) {
      await teardownCleanRoom(ctx.cleanRoom);
    }
  }
}

/**
 * Build the final verification report.
 */
function buildReport(
  ctx: VerifyContext,
  startTime: number,
  snapshotId: string,
  runId: string,
  iteration: number,
  logs: string,
  error?: string
): VerificationReport {
  const endTime = Date.now();
  const id = randomUUID();

  // Determine overall pass/fail
  const l0Passed = ctx.results.l0?.passed ?? false;
  const l1Passed = ctx.results.l1?.passed ?? false;
  const l2Passed = ctx.results.l2?.passed ?? false;
  const l3Passed = ctx.results.l3?.passed ?? false;

  const passed = l0Passed && l1Passed && l2Passed && l3Passed && !error;

  // Create default results for any missing levels
  const l0Result = ctx.results.l0 ?? createEmptyResult(VerificationLevel.L0);
  const l1Result = ctx.results.l1 ?? createEmptyResult(VerificationLevel.L1);
  const l2Result = ctx.results.l2 ?? createEmptyResult(VerificationLevel.L2);
  const l3Result = ctx.results.l3 ?? createEmptyResult(VerificationLevel.L3);

  const report: VerificationReport = {
    id,
    snapshotId,
    runId,
    iteration,
    passed,
    l0Result,
    l1Result,
    l2Result,
    l3Result,
    logs,
    diagnostics: ctx.diagnostics.map((d) => ({
      level: d.level,
      type: d.type,
      message: d.message,
      file: d.file ?? null,
      line: d.line ?? null,
      column: d.column ?? null,
    })),
    totalDuration: endTime - startTime,
    createdAt: new Date(),
  };

  log.info(
    {
      id,
      passed,
      l0: l0Passed,
      l1: l1Passed,
      l2: l2Passed,
      l3: l3Passed,
      totalDuration: report.totalDuration,
    },
    'Verification complete'
  );

  return report;
}

/**
 * Check if verification has exceeded its time limit.
 */
function isTimedOut(ctx: VerifyContext): boolean {
  const elapsed = Date.now() - ctx.startTime.getTime();
  return elapsed > ctx.timeoutMs;
}

/**
 * Create a skipped result for a level.
 */
function createSkippedResult(level: VerificationLevel): LevelResult {
  return {
    level,
    passed: true,
    checks: [
      {
        name: 'skipped',
        passed: true,
        message: 'Level was skipped',
        details: null,
      },
    ],
    duration: 0,
  };
}

/**
 * Create an empty result for a level that wasn't run.
 */
function createEmptyResult(level: VerificationLevel): LevelResult {
  return {
    level,
    passed: false,
    checks: [],
    duration: 0,
  };
}
