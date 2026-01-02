/**
 * Security Enforcement Engine
 *
 * Central orchestrator for security scanning. Coordinates detectors,
 * aggregates findings, applies allowlists, and determines enforcement actions.
 */

import fg from 'fast-glob';
import { logger } from '../../utils/logger.js';
import type { Finding, ResolvedSecurityPolicy } from '../types.js';
import type { DetectorRegistry } from '../detectors/registry.js';
import type { DetectorContext, DetectorFinding } from '../detectors/types.js';
import { detectorRegistry } from '../detectors/registry.js';
import { FindingAggregator } from './aggregator.js';
import type { EnforcementResult } from './types.js';

// ============================================================================
// Security Enforcement Engine
// ============================================================================

/**
 * Orchestrates security scanning and enforcement.
 */
export class SecurityEnforcementEngine {
  private readonly registry: DetectorRegistry;
  private readonly aggregator: FindingAggregator;

  constructor(registry: DetectorRegistry = detectorRegistry) {
    this.registry = registry;
    this.aggregator = new FindingAggregator();
  }

  /**
   * Run security enforcement on a workspace.
   * @param workspaceDir - Directory to scan
   * @param policy - Resolved security policy to apply
   * @param signal - Optional abort signal for cancellation
   * @returns Enforcement result with findings and decision
   */
  async enforce(
    workspaceDir: string,
    policy: ResolvedSecurityPolicy,
    signal?: AbortSignal
  ): Promise<EnforcementResult> {
    const startTime = Date.now();

    logger.debug({ workspaceDir, policy: policy.name }, 'Starting security enforcement');

    // Get list of files to scan
    const files = await this.getFilesToScan(workspaceDir, policy.excludes);
    logger.debug({ fileCount: files.length }, 'Files to scan');

    // Build allowlist set for quick lookup
    const allowlistSet = new Set(policy.allowlist.map((a) => a.pattern));

    // Build detector context - only include signal if defined
    const ctx: DetectorContext = signal
      ? { workspaceDir, files, policy, allowlist: allowlistSet, signal }
      : { workspaceDir, files, policy, allowlist: allowlistSet };

    // Run all enabled detectors
    const allFindings: Finding[] = [];

    for (const detectorConfig of policy.detectors) {
      if (!detectorConfig.enabled) {
        logger.debug({ detector: detectorConfig.type }, 'Detector disabled, skipping');
        continue;
      }

      const detector = this.registry.get(detectorConfig.type);
      if (!detector) {
        logger.warn(
          { type: detectorConfig.type },
          'Detector not found in registry, skipping'
        );
        continue;
      }

      // Validate detector options
      const options = detectorConfig.options || {};
      const validation = detector.validateOptions(options);
      if (!validation.valid) {
        logger.warn(
          { detector: detectorConfig.type, errors: validation.errors },
          'Detector options validation failed, skipping'
        );
        continue;
      }

      // Run detector
      try {
        logger.debug({ detector: detectorConfig.type }, 'Running detector');
        const findings = await detector.detect(ctx, options);

        // Convert DetectorFinding to Finding with configured sensitivity
        const processedFindings: Finding[] = findings.map((f: DetectorFinding) => ({
          ...f,
          sensitivity: f.sensitivity || detectorConfig.sensitivity,
        }));

        allFindings.push(...processedFindings);
        logger.debug(
          { detector: detectorConfig.type, findingCount: findings.length },
          'Detector completed'
        );
      } catch (error) {
        logger.error(
          { error, detector: detectorConfig.type },
          'Detector failed during execution'
        );
        // Continue with remaining detectors
      }
    }

    const scanDuration = Date.now() - startTime;

    // Aggregate and categorize findings
    const { filteredFindings, categorized, summary } = this.aggregator.aggregate(
      allFindings,
      policy,
      scanDuration,
      files.length
    );

    // Build enforcement result
    const result: EnforcementResult = {
      allowed: categorized.blocked.length === 0,
      findings: filteredFindings,
      blockedFindings: categorized.blocked,
      warnedFindings: categorized.warned,
      summary,
      policy,
    };

    logger.info(
      {
        allowed: result.allowed,
        total: summary.total,
        blocked: categorized.blocked.length,
        warned: categorized.warned.length,
        duration: scanDuration,
        filesScanned: files.length,
      },
      'Security enforcement complete'
    );

    return result;
  }

  /**
   * Get list of files to scan, respecting excludes.
   */
  async getFilesToScan(workspaceDir: string, excludes: string[]): Promise<string[]> {
    try {
      const files = await fg('**/*', {
        cwd: workspaceDir,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: excludes,
      });

      return files;
    } catch (error) {
      logger.error({ error, workspaceDir }, 'Failed to get files to scan');
      return [];
    }
  }

  /**
   * Check if a result blocks execution.
   */
  isBlocked(result: EnforcementResult): boolean {
    return result.blockedFindings.length > 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default SecurityEnforcementEngine instance.
 * Uses the global detector registry.
 */
export const securityEngine = new SecurityEnforcementEngine();
