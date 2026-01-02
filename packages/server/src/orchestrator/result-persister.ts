/**
 * Result Persister.
 * Persists full agent results to disk for post-mortem debugging.
 * (v0.2.19 - Thrust 1)
 */

import { join } from 'node:path';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import type { AgentResult } from '../types/agent.js';
import {
  type PersistedAgentResult,
  type SaveAgentResultOptions,
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
}

// Singleton instance
export const resultPersister = new ResultPersister();
