/**
 * Gate Result Aggregator
 * Collects and aggregates results from multiple gates.
 *
 * (v0.2.27 - Thrust 14: Custom Gate Type Support)
 */

import { createLogger } from '../utils/logger.js';
import type { GateWeight } from './builder.js';

const log = createLogger('gate-aggregator');

/**
 * Individual gate result
 */
export interface GateResult {
  /** Gate identifier */
  gateId: string;
  /** Gate type */
  type: string;
  /** Whether the gate passed */
  passed: boolean;
  /** Gate weight for prioritization */
  weight: GateWeight;
  /** Human-readable message */
  message?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Detailed diagnostics */
  diagnostics?: GateDiagnostic[];
  /** Artifacts produced */
  artifacts?: GateArtifact[];
  /** Error if gate failed with exception */
  error?: string;
  /** Timestamp when gate completed */
  completedAt: Date;
}

/**
 * Diagnostic information from a gate
 */
export interface GateDiagnostic {
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Diagnostic message */
  message: string;
  /** Related file path */
  file?: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Artifact produced by a gate
 */
export interface GateArtifact {
  /** Artifact name */
  name: string;
  /** Artifact type */
  type: 'log' | 'report' | 'coverage' | 'screenshot' | 'other';
  /** Path to artifact */
  path?: string;
  /** Inline content (small artifacts) */
  content?: string;
  /** Size in bytes */
  size?: number;
}

/**
 * Aggregated result summary
 */
export interface AggregatedResult {
  /** Overall success */
  success: boolean;
  /** Total gates executed */
  totalGates: number;
  /** Gates that passed */
  passedGates: number;
  /** Gates that failed */
  failedGates: number;
  /** Gates that were skipped */
  skippedGates: number;
  /** Critical failures (critical weight that failed) */
  criticalFailures: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Individual results */
  results: GateResult[];
  /** Aggregated diagnostics (prioritized) */
  diagnostics: GateDiagnostic[];
  /** Summary message */
  summary: string;
  /** Detailed feedback for agents */
  feedback: string;
}

/**
 * Weight priority order (higher = more important)
 */
const WEIGHT_PRIORITY: Record<GateWeight, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  advisory: 1,
};

/**
 * Gate Result Aggregator
 * Collects results from multiple gates and produces aggregated feedback.
 */
export class GateResultAggregator {
  private results: GateResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Add a gate result
   */
  addResult(result: GateResult): void {
    this.results.push(result);
    log.debug(
      { gateId: result.gateId, passed: result.passed, weight: result.weight },
      'Gate result added'
    );
  }

  /**
   * Add multiple results
   */
  addResults(results: GateResult[]): void {
    for (const result of results) {
      this.addResult(result);
    }
  }

  /**
   * Get all results
   */
  getResults(): GateResult[] {
    return [...this.results];
  }

  /**
   * Check if all gates passed
   */
  allPassed(): boolean {
    return this.results.every(r => r.passed);
  }

  /**
   * Check if any critical gates failed
   */
  hasCriticalFailures(): boolean {
    return this.results.some(r => !r.passed && r.weight === 'critical');
  }

  /**
   * Get failed gates
   */
  getFailedGates(): GateResult[] {
    return this.results.filter(r => !r.passed);
  }

  /**
   * Get passed gates
   */
  getPassedGates(): GateResult[] {
    return this.results.filter(r => r.passed);
  }

  /**
   * Aggregate all results
   */
  aggregate(): AggregatedResult {
    const passed = this.results.filter(r => r.passed);
    const failed = this.results.filter(r => !r.passed);
    const critical = failed.filter(r => r.weight === 'critical');
    const totalDuration = this.results.reduce((sum, r) => sum + r.durationMs, 0);

    // Sort failed gates by weight priority (highest first)
    const sortedFailed = [...failed].sort(
      (a, b) => WEIGHT_PRIORITY[b.weight] - WEIGHT_PRIORITY[a.weight]
    );

    // Collect all diagnostics, prioritized by severity and weight
    const diagnostics = this.collectDiagnostics(sortedFailed);

    // Generate summary
    const summary = this.generateSummary(passed.length, failed.length, critical.length);

    // Generate detailed feedback
    const feedback = this.generateFeedback(sortedFailed, diagnostics);

    const result: AggregatedResult = {
      success: failed.length === 0,
      totalGates: this.results.length,
      passedGates: passed.length,
      failedGates: failed.length,
      skippedGates: 0, // Could be tracked if gates are conditionally skipped
      criticalFailures: critical.length,
      totalDurationMs: totalDuration,
      results: this.results,
      diagnostics,
      summary,
      feedback,
    };

    log.info(
      {
        success: result.success,
        total: result.totalGates,
        passed: result.passedGates,
        failed: result.failedGates,
        critical: result.criticalFailures,
      },
      'Gate results aggregated'
    );

    return result;
  }

  /**
   * Collect diagnostics from failed gates
   */
  private collectDiagnostics(failedGates: GateResult[]): GateDiagnostic[] {
    const diagnostics: GateDiagnostic[] = [];

    for (const gate of failedGates) {
      if (gate.diagnostics) {
        diagnostics.push(...gate.diagnostics);
      }

      // Add error as diagnostic if present
      if (gate.error) {
        diagnostics.push({
          severity: 'error',
          message: `${gate.gateId}: ${gate.error}`,
        });
      }

      // Add failure message as diagnostic
      if (gate.message && !gate.passed) {
        diagnostics.push({
          severity: 'error',
          message: `${gate.gateId}: ${gate.message}`,
        });
      }
    }

    // Sort by severity (errors first)
    const severityOrder = { error: 0, warning: 1, info: 2 };
    diagnostics.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return diagnostics;
  }

  /**
   * Generate summary message
   */
  private generateSummary(passed: number, failed: number, critical: number): string {
    if (failed === 0) {
      return `All ${passed} gates passed successfully.`;
    }

    const parts: string[] = [];
    parts.push(`${failed} of ${passed + failed} gates failed`);

    if (critical > 0) {
      parts.push(`(${critical} critical)`);
    }

    return parts.join(' ');
  }

  /**
   * Generate detailed feedback for agents
   */
  private generateFeedback(
    failedGates: GateResult[],
    diagnostics: GateDiagnostic[]
  ): string {
    const lines: string[] = [];

    if (failedGates.length === 0) {
      lines.push('✓ All gates passed. No issues found.');
      return lines.join('\n');
    }

    lines.push('## Gate Verification Failed\n');

    // Group by weight
    const byWeight = new Map<GateWeight, GateResult[]>();
    for (const gate of failedGates) {
      const list = byWeight.get(gate.weight) || [];
      list.push(gate);
      byWeight.set(gate.weight, list);
    }

    // Output failures by weight (highest priority first)
    const weights: GateWeight[] = ['critical', 'high', 'normal', 'low', 'advisory'];
    for (const weight of weights) {
      const gates = byWeight.get(weight);
      if (gates && gates.length > 0) {
        lines.push(`### ${weight.toUpperCase()} Priority\n`);
        for (const gate of gates) {
          lines.push(`- **${gate.gateId}** (${gate.type}): ${gate.message || 'Failed'}`);
          if (gate.error) {
            lines.push(`  - Error: ${gate.error}`);
          }
        }
        lines.push('');
      }
    }

    // Add diagnostics summary
    const errors = diagnostics.filter(d => d.severity === 'error');
    if (errors.length > 0) {
      lines.push('### Errors\n');
      const maxErrors = 10;
      const toShow = errors.slice(0, maxErrors);
      for (const diag of toShow) {
        let msg = `- ${diag.message}`;
        if (diag.file) {
          msg += ` (${diag.file}`;
          if (diag.line) msg += `:${diag.line}`;
          msg += ')';
        }
        lines.push(msg);
        if (diag.suggestion) {
          lines.push(`  - Suggestion: ${diag.suggestion}`);
        }
      }
      if (errors.length > maxErrors) {
        lines.push(`- ... and ${errors.length - maxErrors} more errors`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset the aggregator
   */
  reset(): void {
    this.results = [];
    this.startTime = Date.now();
  }
}

/**
 * Create a new gate result aggregator
 */
export function createGateResultAggregator(): GateResultAggregator {
  return new GateResultAggregator();
}

/**
 * Create a gate result from execution
 */
export function createGateResult(options: {
  gateId: string;
  type: string;
  passed: boolean;
  weight?: GateWeight;
  message?: string;
  durationMs: number;
  diagnostics?: GateDiagnostic[];
  artifacts?: GateArtifact[];
  error?: string;
}): GateResult {
  return {
    gateId: options.gateId,
    type: options.type,
    passed: options.passed,
    weight: options.weight || 'normal',
    message: options.message,
    durationMs: options.durationMs,
    diagnostics: options.diagnostics,
    artifacts: options.artifacts,
    error: options.error,
    completedAt: new Date(),
  };
}
