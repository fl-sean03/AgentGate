/**
 * L0 Security Verification Bridge
 *
 * Bridges the new Security Policy Engine with the existing L0 verification system.
 * Maps enforcement results to CheckResult format for compatibility.
 */

import { VerificationLevel, type CheckResult } from '../../types/index.js';
import type { VerifyContext, DiagnosticLocal } from '../../verifier/types.js';
import { logger } from '../../utils/logger.js';
import type { Finding } from '../types.js';
import { resolveSecurityPolicy } from '../policy/resolver.js';
import { securityEngine } from '../enforcement/engine.js';
import { auditLogger } from '../audit/logger.js';
import { isSecurityAuditEnabled, isStrictModeEnabled } from './feature-flags.js';
import type { EnforcementResult } from '../enforcement/types.js';

// ============================================================================
// Security Verification Result
// ============================================================================

/**
 * Extended check result with security-specific fields.
 */
export interface SecurityCheckResult extends CheckResult {
  /** Security enforcement result */
  enforcementResult?: EnforcementResult;
}

// ============================================================================
// Bridge Functions
// ============================================================================

/**
 * Run security verification using the new Security Policy Engine.
 * @param workDir - Workspace directory to scan
 * @param ctx - Verification context
 * @param profileName - Optional security profile name
 * @returns CheckResult compatible with L0 verification
 */
export async function runSecurityVerification(
  workDir: string,
  ctx: VerifyContext,
  profileName?: string
): Promise<SecurityCheckResult> {
  try {
    // Resolve security policy
    const policy = await resolveSecurityPolicy(workDir, profileName);

    logger.debug(
      { policy: policy.name, workDir, profile: profileName },
      'Running security verification with policy'
    );

    // Run enforcement
    const result = await securityEngine.enforce(workDir, policy);

    // Log to audit if enabled
    if (isSecurityAuditEnabled()) {
      await auditLogger.logEnforcement({
        result,
        // runId and workOrderId would be passed from higher context
      });
    }

    // Add diagnostics to context
    addSecurityDiagnostics(result, ctx);

    // Map to CheckResult
    return mapEnforcementToCheckResult(result, ctx);
  } catch (error) {
    logger.error({ error, workDir }, 'Security verification failed');

    return {
      name: 'security-verification',
      passed: false,
      message: `Security verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: null,
    };
  }
}

/**
 * Map EnforcementResult to CheckResult format.
 */
export function mapEnforcementToCheckResult(
  result: EnforcementResult,
  _ctx: VerifyContext
): SecurityCheckResult {
  const { summary, blockedFindings, warnedFindings } = result;

  // In strict mode, warnings also block
  const effectiveBlocked = isStrictModeEnabled()
    ? [...blockedFindings, ...warnedFindings]
    : blockedFindings;

  const passed = effectiveBlocked.length === 0;

  // Build message
  let message: string;
  if (passed) {
    if (warnedFindings.length > 0) {
      message = `Security verification passed (scanned ${summary.filesScanned} files, ${warnedFindings.length} warning(s))`;
    } else {
      message = `Security verification passed (scanned ${summary.filesScanned} files)`;
    }
  } else {
    message = `Security verification failed: ${effectiveBlocked.length} blocked finding(s)`;
  }

  // Build details
  const details = buildCheckDetails(result);

  return {
    name: 'security-verification',
    passed,
    message,
    details,
    enforcementResult: result,
  };
}

/**
 * Build detailed output for check result.
 */
function buildCheckDetails(result: EnforcementResult): string | null {
  const { blockedFindings, warnedFindings } = result;

  if (blockedFindings.length === 0 && warnedFindings.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (blockedFindings.length > 0) {
    lines.push('Blocked findings:');
    for (const finding of blockedFindings.slice(0, 10)) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      lines.push(`  - ${location} [${finding.ruleId}] ${finding.message}`);
    }
    if (blockedFindings.length > 10) {
      lines.push(`  ... and ${blockedFindings.length - 10} more`);
    }
  }

  if (warnedFindings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const finding of warnedFindings.slice(0, 5)) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      lines.push(`  - ${location} [${finding.ruleId}] ${finding.message}`);
    }
    if (warnedFindings.length > 5) {
      lines.push(`  ... and ${warnedFindings.length - 5} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Add security findings to verification diagnostics.
 */
export function addSecurityDiagnostics(
  result: EnforcementResult,
  ctx: VerifyContext
): void {
  // Add blocked findings as L0 diagnostics
  for (const finding of result.blockedFindings) {
    const diagnostic: DiagnosticLocal = {
      level: VerificationLevel.L0,
      type: 'security_finding',
      message: finding.message,
      file: finding.file,
      details: formatFindingDetails(finding),
    };
    if (finding.line !== undefined) {
      diagnostic.line = finding.line;
    }
    ctx.diagnostics.push(diagnostic);
  }

  // Add warned findings as L0 warnings (different type)
  for (const finding of result.warnedFindings) {
    const diagnostic: DiagnosticLocal = {
      level: VerificationLevel.L0,
      type: 'security_warning',
      message: finding.message,
      file: finding.file,
      details: formatFindingDetails(finding),
    };
    if (finding.line !== undefined) {
      diagnostic.line = finding.line;
    }
    ctx.diagnostics.push(diagnostic);
  }
}

/**
 * Format finding details for diagnostic output.
 */
function formatFindingDetails(finding: Finding): string {
  const parts: string[] = [
    `Rule: ${finding.ruleId}`,
    `Detector: ${finding.detector}`,
    `Sensitivity: ${finding.sensitivity}`,
  ];

  if (finding.match) {
    parts.push(`Match: ${finding.match}`);
  }

  return parts.join(', ');
}

/**
 * Convert legacy forbidden patterns to security policy config.
 * Used for backwards compatibility during migration.
 */
export function convertForbiddenPatternsToPolicy(
  forbiddenPatterns: string[]
): Partial<{ detectors: Array<{ type: string; enabled: boolean; options: { patterns: string[] } }> }> {
  if (forbiddenPatterns.length === 0) {
    return {};
  }

  return {
    detectors: [
      {
        type: 'pattern',
        enabled: true,
        options: {
          patterns: forbiddenPatterns,
        },
      },
    ],
  };
}
