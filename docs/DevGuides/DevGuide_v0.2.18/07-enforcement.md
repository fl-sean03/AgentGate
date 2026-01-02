# 07: Enforcement Engine

This document covers Thrust 6: implementing the enforcement engine that aggregates findings and determines actions.

---

## Thrust 6: Enforcement Engine

### 6.1 Objective

Implement the Security Enforcement Engine that orchestrates all detectors, aggregates their findings, applies allowlist rules, determines enforcement actions based on policy, and produces a comprehensive result.

### 6.2 Background

The Enforcement Engine is the central coordinator of the Security Policy Engine. It:
- Loads and validates the security policy
- Gets the list of files to scan
- Runs all enabled detectors
- Aggregates findings from all detectors
- Filters findings against allowlist
- Applies sensitivity-to-action mapping
- Returns a structured result for L0 verification

### 6.3 Subtasks

#### 6.3.1 Create Enforcement Types

Create `packages/server/src/security/enforcement/types.ts`:

**EnforcementResult Interface:**
- `allowed: boolean` - Whether execution should proceed
- `findings: Finding[]` - All findings from detection
- `blockedFindings: Finding[]` - Findings that caused blocking
- `warnedFindings: Finding[]` - Findings that were warnings
- `summary: EnforcementSummary` - Aggregate statistics

**EnforcementSummary Interface:**
- `total: number` - Total findings count
- `byLevel: Record<SensitivityLevel, number>` - Count per sensitivity
- `byDetector: Record<string, number>` - Count per detector
- `scanDuration: number` - Time taken in ms
- `filesScanned: number` - Number of files scanned

#### 6.3.2 Create Finding Aggregator

Create `packages/server/src/security/enforcement/aggregator.ts`:

**FindingAggregator Class:**

Methods:

**aggregate(findings, policy):**
1. Apply allowlist filtering
2. Categorize by sensitivity level
3. Build summary statistics
4. Return categorized result

**filterByAllowlist(findings, allowlist):**
1. For each finding:
   - For each allowlist entry:
     - If pattern matches finding.file:
       - If entry.detectors is empty or includes finding.detector:
         - If not expired:
           - Filter out this finding
           - Log that allowlist was used
2. Return filtered findings

**matchesPattern(file, pattern):**
- Use minimatch for glob matching
- Handle both exact paths and wildcards
- Return boolean

**isAllowlistExpired(entry):**
- If no expiresAt, return false
- Parse expiresAt as Date
- Compare with current date
- Return true if expired

**buildSummary(findings, duration, fileCount):**
- Count by sensitivity level
- Count by detector type
- Return EnforcementSummary object

#### 6.3.3 Implement Enforcement Engine

Create `packages/server/src/security/enforcement/engine.ts`:

**SecurityEnforcementEngine Class:**

Constructor:
- Takes detectorRegistry as dependency

Methods:

**enforce(workspaceDir, policy): Promise<EnforcementResult>:**
1. Record start time
2. Get list of files to scan (respecting policy.excludes)
3. Build allowlist set for quick lookup
4. For each enabled detector in policy:
   - Get detector from registry
   - Validate detector options
   - Build DetectorContext
   - Run detector.detect()
   - Collect findings
5. Use FindingAggregator to process findings
6. Determine blocked vs warned findings based on policy.enforcement
7. Build and return EnforcementResult

**getFilesToScan(workspaceDir, excludes):**
1. Use fast-glob with pattern `**/*`
2. Apply excludes from policy
3. Return array of relative paths

**categorizeByAction(findings, enforcement):**
1. Create blockedFindings and warnedFindings arrays
2. For each finding:
   - Get action from enforcement[finding.sensitivity]
   - If BLOCK or DENY: add to blockedFindings
   - If WARN: add to warnedFindings
3. Return both arrays

**isBlocked(result): boolean:**
- Return result.blockedFindings.length > 0

**Export singleton:**
- Export `securityEngine` as singleton instance
- Constructed with global detectorRegistry

#### 6.3.4 Create Enforcement Index

Create `packages/server/src/security/enforcement/index.ts`:
- Export EnforcementResult, EnforcementSummary types
- Export SecurityEnforcementEngine class
- Export securityEngine singleton
- Export FindingAggregator

### 6.4 Verification Steps

1. Create test workspace with known secret
2. Run enforce() and verify finding is returned
3. Test with allowlist entry for the file
4. Verify allowlisted file is not in blockedFindings
5. Test sensitivity level mapping:
   - RESTRICTED → DENY → blockedFindings
   - SENSITIVE → BLOCK → blockedFindings
   - WARNING → WARN → warnedFindings
   - INFO → LOG → neither array
6. Verify summary counts are accurate
7. Test with expired allowlist entry (should not filter)
8. Test with detector-specific allowlist entry

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/enforcement/types.ts` | Created |
| `packages/server/src/security/enforcement/aggregator.ts` | Created |
| `packages/server/src/security/enforcement/engine.ts` | Created |
| `packages/server/src/security/enforcement/index.ts` | Created |
| `packages/server/src/security/index.ts` | Modified - export enforcement |

---

## Enforcement Flow

### Complete Execution Flow

```
1. enforce(workspaceDir, policy) called
   │
   v
2. Get files to scan
   ├── Use fast-glob with **/*
   ├── Apply policy.excludes
   └── Result: string[] of relative paths
   │
   v
3. For each enabled detector:
   │
   ├──> ContentDetector.detect()
   │    └── Returns Finding[]
   │
   ├──> EntropyDetector.detect()
   │    └── Returns Finding[]
   │
   ├──> PatternDetector.detect()
   │    └── Returns Finding[]
   │
   └──> GitignoreDetector.detect()
        └── Returns Finding[]
   │
   v
4. Aggregate all findings
   ├── Combine all Finding[] arrays
   └── Result: Finding[]
   │
   v
5. Apply allowlist filtering
   ├── For each finding, check against allowlist
   ├── Remove matching (non-expired) entries
   └── Result: filtered Finding[]
   │
   v
6. Categorize by enforcement action
   ├── Map each finding.sensitivity → action
   ├── BLOCK/DENY → blockedFindings
   ├── WARN → warnedFindings
   └── LOG → (logged only)
   │
   v
7. Build EnforcementResult
   └── allowed: blockedFindings.length === 0
```

### Detector Execution

Detectors run independently:
- Each detector has its own options from policy
- Detector failures are logged but don't stop scan
- Findings include detector name for attribution

```
┌─────────────────────────────────────────────────────┐
│                  Detector Registry                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  for each detector in policy.detectors:             │
│    if detector.enabled:                             │
│      findings += registry.get(type).detect(ctx)     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Allowlist Matching

```
for each finding:
  for each allowlist entry:
    if minimatch(finding.file, entry.pattern):
      if entry.detectors is empty OR includes finding.detector:
        if not isExpired(entry):
          FILTER OUT this finding
          LOG allowlist usage for audit
```

---

## Result Structure

### EnforcementResult Example

```json
{
  "allowed": false,
  "findings": [
    {
      "ruleId": "aws-access-key",
      "message": "AWS Access Key ID detected",
      "file": "src/config.ts",
      "line": 12,
      "match": "AKIA****...****XXXX",
      "sensitivity": "restricted",
      "detector": "content"
    },
    {
      "ruleId": "high-entropy",
      "message": "High-entropy string (4.7 bits)",
      "file": "src/utils.ts",
      "line": 45,
      "sensitivity": "warning",
      "detector": "entropy"
    }
  ],
  "blockedFindings": [
    { /* AWS key finding */ }
  ],
  "warnedFindings": [
    { /* entropy finding */ }
  ],
  "summary": {
    "total": 2,
    "byLevel": {
      "info": 0,
      "warning": 1,
      "sensitive": 0,
      "restricted": 1
    },
    "byDetector": {
      "content": 1,
      "entropy": 1
    },
    "scanDuration": 1234,
    "filesScanned": 150
  }
}
```

---

## Error Handling

### Detector Failures

If a detector throws during execution:
1. Log error with detector name and stack trace
2. Continue with remaining detectors
3. Don't fail the entire scan

```typescript
try {
  const findings = await detector.detect(ctx, options);
  allFindings.push(...findings);
} catch (error) {
  logger.error({ error, detector: detector.type }, 'Detector failed');
  // Continue with next detector
}
```

### Invalid Options

If detector options validation fails:
1. Log validation errors
2. Skip this detector
3. Continue with remaining detectors

### File Access Errors

If file can't be read during detection:
1. Log warning
2. Skip this file
3. Continue with remaining files
