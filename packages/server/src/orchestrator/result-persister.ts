/**
 * Result Persister (v0.2.19 - Observability & Reliability).
 * Persists full agent results and verification reports to disk for post-mortem debugging.
 * - Thrust 1: AgentResult persistence
 * - Thrust 2: VerificationReport persistence
 */

import { join } from 'node:path';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import type { AgentResult } from '../types/agent.js';
import type { VerificationReport, LevelResult } from '../types/verification.js';
import {
  type PersistedAgentResult,
  type SaveAgentResultOptions,
  type PersistedVerificationReport,
  type VerificationHarnessConfig,
  DEFAULT_SAVE_OPTIONS,
} from '../types/persisted-results.js';
import { getRunDir, ensureRunStructure } from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('result-persister');

/**
 * Persists full agent results to disk.
 */
export class ResultPersister {
  /**
   * Save agent result to disk.
   */
  async saveAgentResult(
    runId: string,
    iteration: number,
    result: AgentResult,
    options: SaveAgentResultOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_SAVE_OPTIONS, ...options };
    await ensureRunStructure(runId);
    const runDir = getRunDir(runId);

    const persisted: PersistedAgentResult = {
      runId,
      iteration,
      capturedAt: new Date().toISOString(),
      sessionId: result.sessionId ?? 'unknown',
      model: result.model ?? null,
      success: result.success,
      exitCode: result.exitCode,
      stdout: this.truncate(result.stdout, opts.maxStdoutBytes!),
      stderr: this.truncate(result.stderr, opts.maxStderrBytes!),
      structuredOutput: result.structuredOutput,
      toolCalls: opts.includeToolCalls ? (result.toolCalls ?? []) : [],
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      totalCostUsd: result.totalCostUsd ?? null,
    };

    const filePath = join(runDir, `agent-${iteration}.json`);
    await writeFile(filePath, JSON.stringify(persisted, null, 2));

    log.debug({ runId, iteration, filePath }, 'Saved agent result');
    return filePath;
  }

  /**
   * Load agent result from disk.
   */
  async loadAgentResult(
    runId: string,
    iteration: number
  ): Promise<PersistedAgentResult | null> {
    try {
      const runDir = getRunDir(runId);
      const filePath = join(runDir, `agent-${iteration}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as PersistedAgentResult;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all agent result iterations for a run.
   */
  async listAgentResults(runId: string): Promise<number[]> {
    try {
      const runDir = getRunDir(runId);
      const files = await readdir(runDir);

      return files
        .filter((f) => f.startsWith('agent-') && f.endsWith('.json'))
        .map((f) => parseInt(f.replace('agent-', '').replace('.json', ''), 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // ==================== Verification Report Methods (Thrust 2) ====================

  /**
   * Save verification report to disk.
   */
  async saveVerificationReport(
    runId: string,
    iteration: number,
    report: VerificationReport,
    harnessConfig?: VerificationHarnessConfig
  ): Promise<string> {
    await ensureRunStructure(runId);
    const runDir = getRunDir(runId);

    const persisted: PersistedVerificationReport = {
      ...report,
      capturedAt: new Date().toISOString(),
      skippedLevels: this.determineSkippedLevels(report, harnessConfig?.skipLevels ?? []),
      harnessConfig: {
        waitForCI: harnessConfig?.waitForCI ?? false,
        skipLevels: harnessConfig?.skipLevels ?? [],
      },
    };

    const filePath = join(runDir, `verification-${iteration}.json`);
    await writeFile(filePath, JSON.stringify(persisted, null, 2));

    log.debug({ runId, iteration, filePath }, 'Saved verification report');
    return filePath;
  }

  /**
   * Load verification report from disk.
   */
  async loadVerificationReport(
    runId: string,
    iteration: number
  ): Promise<PersistedVerificationReport | null> {
    try {
      const runDir = getRunDir(runId);
      const filePath = join(runDir, `verification-${iteration}.json`);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as PersistedVerificationReport;

      // Reconstruct Date object
      return {
        ...data,
        createdAt: new Date(data.createdAt as unknown as string),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all verification report iterations for a run.
   */
  async listVerificationReports(runId: string): Promise<number[]> {
    try {
      const runDir = getRunDir(runId);
      const files = await readdir(runDir);

      return files
        .filter((f) => f.startsWith('verification-') && f.endsWith('.json'))
        .map((f) => parseInt(f.replace('verification-', '').replace('.json', ''), 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // ==================== Private Helpers ====================

  private truncate(text: string, maxBytes: number): string {
    if (Buffer.byteLength(text) <= maxBytes) {
      return text;
    }

    // Truncate with message
    const truncatedText = Buffer.from(text)
      .subarray(0, maxBytes - 100)
      .toString('utf-8');
    return truncatedText + `\n\n[TRUNCATED - exceeded ${maxBytes} bytes]`;
  }

  /**
   * Determine which levels were skipped based on report and config.
   */
  private determineSkippedLevels(
    report: VerificationReport,
    configSkipLevels: string[]
  ): string[] {
    const allLevels = ['L0', 'L1', 'L2', 'L3'];

    // Check which levels have results
    const levelResults: Record<string, LevelResult | null> = {
      L0: report.l0Result,
      L1: report.l1Result,
      L2: report.l2Result,
      L3: report.l3Result,
    };

    const ranLevels = allLevels.filter((level) => {
      const result = levelResults[level];
      // A level was run if it has checks or was explicitly not skipped
      return result !== null && result !== undefined && result.checks.length > 0;
    });

    // Levels are skipped if they weren't run OR were in configSkipLevels
    return allLevels.filter((l) => !ranLevels.includes(l) || configSkipLevels.includes(l));
  }
}

// Singleton instance
export const resultPersister = new ResultPersister();
