/**
 * Security Enforcement Engine Tests
 *
 * Unit tests for the FindingAggregator and SecurityEnforcementEngine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FindingAggregator } from '../../src/security/enforcement/aggregator.js';
import { SecurityEnforcementEngine } from '../../src/security/enforcement/engine.js';
import {
  SensitivityLevel,
  EnforcementAction,
  type Finding,
  type ResolvedSecurityPolicy,
  type AllowlistEntry,
} from '../../src/security/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'test-rule',
    message: 'Test finding',
    file: 'src/config.ts',
    line: 10,
    sensitivity: SensitivityLevel.SENSITIVE,
    detector: 'content',
    ...overrides,
  };
}

function createMockPolicy(overrides: Partial<ResolvedSecurityPolicy> = {}): ResolvedSecurityPolicy {
  return {
    version: '1.0',
    name: 'test-policy',
    detectors: [
      {
        type: 'content',
        enabled: true,
        sensitivity: SensitivityLevel.RESTRICTED,
        options: {},
      },
    ],
    enforcement: {
      [SensitivityLevel.INFO]: EnforcementAction.LOG,
      [SensitivityLevel.WARNING]: EnforcementAction.WARN,
      [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
      [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
    },
    allowlist: [],
    excludes: ['**/node_modules/**', '**/dist/**'],
    runtime: {
      enabled: true,
      blockAccess: true,
      logAccess: true,
    },
    audit: {
      enabled: true,
      destination: 'file',
      includeContent: false,
      retentionDays: 90,
    },
    source: 'test',
    inheritanceChain: ['default', 'test'],
    resolvedAt: new Date(),
    hash: 'test-hash-123',
    ...overrides,
  };
}

// ============================================================================
// FindingAggregator Tests
// ============================================================================

describe('FindingAggregator', () => {
  let aggregator: FindingAggregator;

  beforeEach(() => {
    aggregator = new FindingAggregator();
  });

  describe('buildSummary', () => {
    it('should build summary with correct counts by level', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.INFO }),
        createMockFinding({ sensitivity: SensitivityLevel.WARNING }),
        createMockFinding({ sensitivity: SensitivityLevel.WARNING }),
        createMockFinding({ sensitivity: SensitivityLevel.SENSITIVE }),
        createMockFinding({ sensitivity: SensitivityLevel.RESTRICTED }),
      ];

      const summary = aggregator.buildSummary(findings, 1000, 100);

      expect(summary.total).toBe(5);
      expect(summary.byLevel[SensitivityLevel.INFO]).toBe(1);
      expect(summary.byLevel[SensitivityLevel.WARNING]).toBe(2);
      expect(summary.byLevel[SensitivityLevel.SENSITIVE]).toBe(1);
      expect(summary.byLevel[SensitivityLevel.RESTRICTED]).toBe(1);
      expect(summary.scanDuration).toBe(1000);
      expect(summary.filesScanned).toBe(100);
    });

    it('should build summary with correct counts by detector', () => {
      const findings: Finding[] = [
        createMockFinding({ detector: 'content' }),
        createMockFinding({ detector: 'content' }),
        createMockFinding({ detector: 'entropy' }),
        createMockFinding({ detector: 'pattern' }),
      ];

      const summary = aggregator.buildSummary(findings, 500, 50);

      expect(summary.byDetector['content']).toBe(2);
      expect(summary.byDetector['entropy']).toBe(1);
      expect(summary.byDetector['pattern']).toBe(1);
    });

    it('should handle empty findings', () => {
      const summary = aggregator.buildSummary([], 100, 10);

      expect(summary.total).toBe(0);
      expect(summary.byLevel[SensitivityLevel.INFO]).toBe(0);
      expect(summary.byLevel[SensitivityLevel.WARNING]).toBe(0);
      expect(summary.byLevel[SensitivityLevel.SENSITIVE]).toBe(0);
      expect(summary.byLevel[SensitivityLevel.RESTRICTED]).toBe(0);
    });
  });

  describe('categorizeByAction', () => {
    it('should categorize DENY findings as blocked', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.RESTRICTED }),
      ];

      const enforcement = {
        [SensitivityLevel.INFO]: EnforcementAction.LOG,
        [SensitivityLevel.WARNING]: EnforcementAction.WARN,
        [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
        [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
      };

      const result = aggregator.categorizeByAction(findings, enforcement);

      expect(result.blocked).toHaveLength(1);
      expect(result.warned).toHaveLength(0);
      expect(result.logged).toHaveLength(0);
    });

    it('should categorize BLOCK findings as blocked', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.SENSITIVE }),
      ];

      const enforcement = {
        [SensitivityLevel.INFO]: EnforcementAction.LOG,
        [SensitivityLevel.WARNING]: EnforcementAction.WARN,
        [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
        [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
      };

      const result = aggregator.categorizeByAction(findings, enforcement);

      expect(result.blocked).toHaveLength(1);
      expect(result.warned).toHaveLength(0);
      expect(result.logged).toHaveLength(0);
    });

    it('should categorize WARN findings as warned', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.WARNING }),
      ];

      const enforcement = {
        [SensitivityLevel.INFO]: EnforcementAction.LOG,
        [SensitivityLevel.WARNING]: EnforcementAction.WARN,
        [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
        [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
      };

      const result = aggregator.categorizeByAction(findings, enforcement);

      expect(result.blocked).toHaveLength(0);
      expect(result.warned).toHaveLength(1);
      expect(result.logged).toHaveLength(0);
    });

    it('should categorize LOG findings as logged', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.INFO }),
      ];

      const enforcement = {
        [SensitivityLevel.INFO]: EnforcementAction.LOG,
        [SensitivityLevel.WARNING]: EnforcementAction.WARN,
        [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
        [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
      };

      const result = aggregator.categorizeByAction(findings, enforcement);

      expect(result.blocked).toHaveLength(0);
      expect(result.warned).toHaveLength(0);
      expect(result.logged).toHaveLength(1);
    });

    it('should categorize mixed findings correctly', () => {
      const findings: Finding[] = [
        createMockFinding({ sensitivity: SensitivityLevel.INFO }),
        createMockFinding({ sensitivity: SensitivityLevel.WARNING }),
        createMockFinding({ sensitivity: SensitivityLevel.SENSITIVE }),
        createMockFinding({ sensitivity: SensitivityLevel.RESTRICTED }),
      ];

      const enforcement = {
        [SensitivityLevel.INFO]: EnforcementAction.LOG,
        [SensitivityLevel.WARNING]: EnforcementAction.WARN,
        [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
        [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
      };

      const result = aggregator.categorizeByAction(findings, enforcement);

      expect(result.blocked).toHaveLength(2); // SENSITIVE + RESTRICTED
      expect(result.warned).toHaveLength(1); // WARNING
      expect(result.logged).toHaveLength(1); // INFO
    });
  });

  describe('filterByAllowlist', () => {
    it('should filter findings that match allowlist pattern', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'test/fixtures/secrets.ts' }),
        createMockFinding({ file: 'src/config.ts' }),
      ];

      const allowlist: AllowlistEntry[] = [
        {
          pattern: 'test/**',
          reason: 'Test fixtures',
        },
      ];

      const filtered = aggregator.filterByAllowlist(findings, allowlist);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].file).toBe('src/config.ts');
    });

    it('should not filter if allowlist is empty', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'src/config.ts' }),
        createMockFinding({ file: 'src/db.ts' }),
      ];

      const filtered = aggregator.filterByAllowlist(findings, []);

      expect(filtered).toHaveLength(2);
    });

    it('should not filter if allowlist entry is expired', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'test/fixtures/secrets.ts' }),
      ];

      const allowlist: AllowlistEntry[] = [
        {
          pattern: 'test/**',
          reason: 'Test fixtures',
          expiresAt: '2020-01-01', // Expired date
        },
      ];

      const filtered = aggregator.filterByAllowlist(findings, allowlist);

      expect(filtered).toHaveLength(1); // Not filtered because expired
    });

    it('should filter only matching detectors when specified', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'test/mock.ts', detector: 'content' }),
        createMockFinding({ file: 'test/mock.ts', detector: 'entropy' }),
      ];

      const allowlist: AllowlistEntry[] = [
        {
          pattern: 'test/**',
          reason: 'Test fixtures',
          detectors: ['content'], // Only allowlist content detector
        },
      ];

      const filtered = aggregator.filterByAllowlist(findings, allowlist);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].detector).toBe('entropy');
    });

    it('should filter all detectors when detectors array is empty', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'test/mock.ts', detector: 'content' }),
        createMockFinding({ file: 'test/mock.ts', detector: 'entropy' }),
      ];

      const allowlist: AllowlistEntry[] = [
        {
          pattern: 'test/**',
          reason: 'Test fixtures',
          detectors: [], // Empty = all detectors
        },
      ];

      const filtered = aggregator.filterByAllowlist(findings, allowlist);

      expect(filtered).toHaveLength(0); // Both filtered
    });
  });

  describe('matchesPattern', () => {
    it('should match exact file paths', () => {
      expect(aggregator.matchesPattern('src/config.ts', 'src/config.ts')).toBe(true);
    });

    it('should match glob patterns', () => {
      expect(aggregator.matchesPattern('src/config.ts', 'src/*.ts')).toBe(true);
      expect(aggregator.matchesPattern('src/config.ts', 'src/**')).toBe(true);
      expect(aggregator.matchesPattern('test/fixtures/data.json', 'test/**')).toBe(true);
    });

    it('should not match non-matching patterns', () => {
      expect(aggregator.matchesPattern('src/config.ts', 'test/**')).toBe(false);
      expect(aggregator.matchesPattern('src/config.ts', '*.js')).toBe(false);
    });
  });

  describe('isAllowlistExpired', () => {
    it('should return false when no expiresAt is set', () => {
      const entry: AllowlistEntry = {
        pattern: 'test/**',
        reason: 'Test',
      };

      expect(aggregator.isAllowlistExpired(entry)).toBe(false);
    });

    it('should return true for past dates', () => {
      const entry: AllowlistEntry = {
        pattern: 'test/**',
        reason: 'Test',
        expiresAt: '2020-01-01',
      };

      expect(aggregator.isAllowlistExpired(entry)).toBe(true);
    });

    it('should return false for future dates', () => {
      const entry: AllowlistEntry = {
        pattern: 'test/**',
        reason: 'Test',
        expiresAt: '2099-12-31',
      };

      expect(aggregator.isAllowlistExpired(entry)).toBe(false);
    });
  });

  describe('aggregate', () => {
    it('should aggregate findings with filtering and categorization', () => {
      const findings: Finding[] = [
        createMockFinding({ file: 'src/config.ts', sensitivity: SensitivityLevel.RESTRICTED }),
        createMockFinding({ file: 'test/mock.ts', sensitivity: SensitivityLevel.SENSITIVE }),
        createMockFinding({ file: 'src/utils.ts', sensitivity: SensitivityLevel.WARNING }),
      ];

      const policy = createMockPolicy({
        allowlist: [
          { pattern: 'test/**', reason: 'Test files' },
        ],
      });

      const result = aggregator.aggregate(findings, policy, 500, 50);

      // test/mock.ts should be filtered out
      expect(result.filteredFindings).toHaveLength(2);
      expect(result.categorized.blocked).toHaveLength(1); // RESTRICTED
      expect(result.categorized.warned).toHaveLength(1); // WARNING
      expect(result.summary.total).toBe(2);
    });
  });
});

// ============================================================================
// SecurityEnforcementEngine Tests
// ============================================================================

describe('SecurityEnforcementEngine', () => {
  describe('isBlocked', () => {
    it('should return true when there are blocked findings', () => {
      const engine = new SecurityEnforcementEngine();
      const result = {
        allowed: false,
        findings: [createMockFinding()],
        blockedFindings: [createMockFinding()],
        warnedFindings: [],
        summary: {
          total: 1,
          byLevel: { info: 0, warning: 0, sensitive: 1, restricted: 0 },
          byDetector: { content: 1 },
          scanDuration: 100,
          filesScanned: 10,
        },
        policy: createMockPolicy(),
      };

      expect(engine.isBlocked(result)).toBe(true);
    });

    it('should return false when there are no blocked findings', () => {
      const engine = new SecurityEnforcementEngine();
      const result = {
        allowed: true,
        findings: [createMockFinding({ sensitivity: SensitivityLevel.WARNING })],
        blockedFindings: [],
        warnedFindings: [createMockFinding({ sensitivity: SensitivityLevel.WARNING })],
        summary: {
          total: 1,
          byLevel: { info: 0, warning: 1, sensitive: 0, restricted: 0 },
          byDetector: { content: 1 },
          scanDuration: 100,
          filesScanned: 10,
        },
        policy: createMockPolicy(),
      };

      expect(engine.isBlocked(result)).toBe(false);
    });
  });
});
