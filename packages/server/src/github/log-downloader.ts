/**
 * GitHub Actions Log Downloader
 *
 * Downloads and extracts workflow run logs from GitHub Actions.
 * Handles zip extraction in memory.
 */

import AdmZip from 'adm-zip';
import { ActionsClient, ActionsApiError, ActionsApiErrorCode } from './actions-client.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('log-downloader');

// ============================================================================
// Types
// ============================================================================

/** Map of job name to log content */
export type JobLogs = Map<string, string>;

/** Options for log download */
export interface DownloadLogsOptions {
  /** Whether to strip ANSI color codes from logs (default: true) */
  stripAnsi?: boolean;
}

// ============================================================================
// ANSI Code Stripping
// ============================================================================

/**
 * Regular expression to match ANSI escape sequences
 *
 * Matches:
 * - ESC [ ... (m for color, other control sequences)
 * - ESC ( for character set selection
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\([0-9a-zA-Z]/g;

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

// ============================================================================
// Log Downloader
// ============================================================================

/**
 * Downloads and extracts GitHub Actions workflow logs
 */
export class LogDownloader {
  private readonly client: ActionsClient;

  constructor(client: ActionsClient) {
    this.client = client;
  }

  /**
   * Download and extract logs for a workflow run
   *
   * @param runId - Workflow run ID
   * @param options - Download options
   * @returns Map of job name to log content
   */
  async downloadLogs(runId: number, options?: DownloadLogsOptions): Promise<JobLogs> {
    const stripAnsi = options?.stripAnsi ?? true;

    logger.debug({ runId }, 'Downloading workflow run logs');

    try {
      const zipBuffer = await this.client.downloadWorkflowLogs(runId);
      return this.extractLogs(zipBuffer, stripAnsi);
    } catch (error) {
      if (error instanceof ActionsApiError) {
        throw error;
      }

      logger.error({ runId, err: error }, 'Failed to download logs');
      throw new ActionsApiError(
        `Failed to download logs for run ${runId}`,
        ActionsApiErrorCode.NETWORK_ERROR,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get logs for a specific job
   *
   * @param runId - Workflow run ID
   * @param jobName - Name of the job
   * @param options - Download options
   * @returns Log content or null if job not found
   */
  async getLogsForJob(
    runId: number,
    jobName: string,
    options?: DownloadLogsOptions
  ): Promise<string | null> {
    const allLogs = await this.downloadLogs(runId, options);

    // Try exact match first
    if (allLogs.has(jobName)) {
      return allLogs.get(jobName)!;
    }

    // Try case-insensitive match
    const normalizedJobName = jobName.toLowerCase();
    for (const [name, content] of allLogs) {
      if (name.toLowerCase() === normalizedJobName) {
        return content;
      }
    }

    // Try partial match (job name might have prefixes in zip)
    for (const [name, content] of allLogs) {
      if (name.toLowerCase().includes(normalizedJobName)) {
        return content;
      }
    }

    return null;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private extractLogs(zipBuffer: ArrayBuffer, stripAnsi: boolean): JobLogs {
    const logs: JobLogs = new Map();

    try {
      const zip = new AdmZip(Buffer.from(zipBuffer));
      const entries = zip.getEntries();

      for (const entry of entries) {
        // Skip directories
        if (entry.isDirectory) {
          continue;
        }

        // Get the job name from the file path
        // GitHub logs are structured as: job_name/step_number_step_name.txt
        // or sometimes just: job_name.txt
        const entryName = entry.entryName;
        const jobName = this.extractJobName(entryName);

        if (!jobName) {
          logger.debug({ entryName }, 'Skipping entry without valid job name');
          continue;
        }

        try {
          let content = entry.getData().toString('utf-8');

          if (stripAnsi) {
            content = stripAnsiCodes(content);
          }

          // Append to existing content (multiple files per job)
          const existing = logs.get(jobName) ?? '';
          logs.set(jobName, existing + content);
        } catch (error) {
          logger.warn({ entryName, err: error }, 'Failed to read log entry');
        }
      }

      logger.debug({ jobCount: logs.size }, 'Extracted logs from zip');
      return logs;
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract logs from zip');
      throw new ActionsApiError(
        'Failed to extract logs from zip archive',
        ActionsApiErrorCode.LOGS_UNAVAILABLE,
        undefined,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  private extractJobName(entryPath: string): string | null {
    // Normalize path separators
    const normalizedPath = entryPath.replace(/\\/g, '/');

    // Handle different log structures:
    // 1. "job_name/1_step_name.txt" -> "job_name"
    // 2. "job_name.txt" -> "job_name"
    // 3. "workflow/job_name/step.txt" -> "job_name"

    const parts = normalizedPath.split('/');

    if (parts.length >= 2) {
      // Take the parent directory as job name
      const jobPart = parts[parts.length - 2];
      if (jobPart) {
        return jobPart;
      }
    }

    if (parts.length === 1) {
      // Single file, remove extension
      const filename = parts[0];
      if (filename?.endsWith('.txt')) {
        return filename.slice(0, -4);
      }
      return filename ?? null;
    }

    return null;
  }
}
