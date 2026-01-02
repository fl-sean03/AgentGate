# 08: Audit Layer

This document covers Thrust 7: implementing the security audit logging system.

---

## Thrust 7: Audit Layer

### 7.1 Objective

Implement comprehensive audit logging for all security decisions, enabling compliance tracking, debugging, and forensic analysis of security events.

### 7.2 Background

Audit logging is critical for:
- **Compliance** - SOC2, ISO 27001 require security decision logging
- **Debugging** - Understanding why a run was blocked
- **Forensics** - Investigating potential security incidents
- **Improvement** - Identifying false positive patterns

The audit layer logs:
- Every enforcement decision (allowed/blocked)
- Every allowlist usage
- Runtime file access (if enabled)
- Policy loading and resolution

### 7.3 Subtasks

#### 7.3.1 Create Audit Event Types

Create `packages/server/src/security/audit/types.ts`:

**AuditEventType Enum:**
- `ENFORCEMENT` - Security enforcement decision
- `ALLOWLIST_USED` - Allowlist entry was applied
- `POLICY_LOADED` - Security policy was loaded
- `RUNTIME_ACCESS` - Runtime file access attempt
- `DETECTOR_ERROR` - Detector threw an error

**BaseAuditEvent Interface:**
- `timestamp: string` - ISO timestamp
- `type: AuditEventType` - Event type
- `workspaceDir: string` - Workspace being scanned
- `runId?: string` - Associated run ID
- `workOrderId?: string` - Associated work order ID

**EnforcementAuditEvent Interface (extends BaseAuditEvent):**
- `type: AuditEventType.ENFORCEMENT`
- `policy: string` - Policy name used
- `policyHash: string` - Policy hash for verification
- `allowed: boolean` - Whether execution was allowed
- `findingCount: number` - Total findings
- `blockedCount: number` - Blocked findings
- `warnedCount: number` - Warned findings
- `duration: number` - Scan duration in ms
- `filesScanned: number` - Number of files scanned
- `findings?: Finding[]` - Optional: findings if includeContent is true

**AllowlistUsedEvent Interface (extends BaseAuditEvent):**
- `type: AuditEventType.ALLOWLIST_USED`
- `pattern: string` - Allowlist pattern that matched
- `file: string` - File that was allowed
- `reason: string` - Reason from allowlist entry
- `approvedBy?: string` - Who approved
- `detector: string` - Which detector's finding was filtered

**RuntimeAccessEvent Interface (extends BaseAuditEvent):**
- `type: AuditEventType.RUNTIME_ACCESS`
- `operation: 'read' | 'write' | 'delete'` - Operation type
- `path: string` - File path accessed
- `allowed: boolean` - Whether access was allowed
- `reason?: string` - Reason if denied

**DetectorErrorEvent Interface (extends BaseAuditEvent):**
- `type: AuditEventType.DETECTOR_ERROR`
- `detector: string` - Detector that failed
- `error: string` - Error message
- `stack?: string` - Stack trace

**AuditEvent Union Type:**
- Union of all event interfaces

#### 7.3.2 Implement Audit Logger

Create `packages/server/src/security/audit/logger.ts`:

**SecurityAuditLogger Class:**

Constructor options:
- `logPath?: string` - Log file path (default: ~/.agentgate/audit/security.jsonl)
- `destination?: 'file' | 'stdout' | 'syslog'` - Output destination
- `includeContent?: boolean` - Include finding details (default: false)
- `maxFileSize?: number` - Max log file size before rotation (default: 10MB)

Methods:

**logEnforcement(data):**
1. Create EnforcementAuditEvent
2. If not includeContent, remove findings from event
3. Call writeEvent()

**logAllowlistUsed(data):**
1. Create AllowlistUsedEvent
2. Call writeEvent()

**logRuntimeAccess(data):**
1. Create RuntimeAccessEvent
2. Call writeEvent()

**logDetectorError(data):**
1. Create DetectorErrorEvent
2. Call writeEvent()

**writeEvent(event):**
1. Serialize event to JSON
2. Based on destination:
   - file: append to log file (JSONL format)
   - stdout: write to console
   - syslog: send to syslog daemon
3. Handle rotation if file exceeds maxFileSize

**rotateLogFile():**
1. Rename current log to security.{timestamp}.jsonl
2. Create new security.jsonl
3. Optionally compress old file

**ensureLogDirectory():**
- Create directory if it doesn't exist
- Set appropriate permissions (700)

**Export singleton:**
- Export `auditLogger` with default configuration
- Allow configuration via environment variables

#### 7.3.3 Create Audit Query Functions

Add query helpers for reading audit logs:

**queryAuditEvents(options):**
- `startDate?: Date` - Events after this date
- `endDate?: Date` - Events before this date
- `type?: AuditEventType` - Filter by event type
- `runId?: string` - Filter by run ID
- `limit?: number` - Max events to return

**getEnforcementHistory(workspaceDir, limit):**
- Get recent enforcement events for a workspace
- Useful for debugging

**getBlockedRuns(startDate, endDate):**
- Get all runs that were blocked in date range
- Useful for compliance reporting

#### 7.3.4 Integrate with Enforcement Engine

Modify `packages/server/src/security/enforcement/engine.ts`:
- After enforcement decision, call `auditLogger.logEnforcement()`
- When allowlist is used, call `auditLogger.logAllowlistUsed()`
- When detector errors, call `auditLogger.logDetectorError()`

#### 7.3.5 Create Audit Index

Create `packages/server/src/security/audit/index.ts`:
- Export all audit event types
- Export SecurityAuditLogger class
- Export auditLogger singleton
- Export query functions

### 7.4 Verification Steps

1. Run enforcement and verify audit event is written
2. Check JSONL format is valid (one JSON per line)
3. Test allowlist usage logging
4. Test runtime access logging
5. Test detector error logging
6. Test log rotation when file exceeds maxFileSize
7. Test query functions with date filters
8. Verify sensitive content is not logged when includeContent is false
9. Test stdout destination mode

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/audit/types.ts` | Created |
| `packages/server/src/security/audit/logger.ts` | Created |
| `packages/server/src/security/audit/index.ts` | Created |
| `packages/server/src/security/enforcement/engine.ts` | Modified - add audit logging |
| `packages/server/src/security/index.ts` | Modified - export audit |

---

## Audit Log Format

### JSONL Format

Each line is a complete JSON object:

```jsonl
{"timestamp":"2024-01-15T10:30:00Z","type":"enforcement","policy":"default","allowed":false,"blockedCount":1}
{"timestamp":"2024-01-15T10:30:01Z","type":"allowlist_used","pattern":"test/**","file":"test/fixtures.ts"}
```

### Event Examples

**Enforcement Event:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "type": "enforcement",
  "workspaceDir": "/home/user/project",
  "runId": "run_abc123",
  "workOrderId": "wo_xyz789",
  "policy": "my-project",
  "policyHash": "sha256:abc123...",
  "allowed": false,
  "findingCount": 3,
  "blockedCount": 1,
  "warnedCount": 2,
  "duration": 1234,
  "filesScanned": 150
}
```

**Allowlist Used Event:**
```json
{
  "timestamp": "2024-01-15T10:30:00.500Z",
  "type": "allowlist_used",
  "workspaceDir": "/home/user/project",
  "runId": "run_abc123",
  "pattern": "test/fixtures/**",
  "file": "test/fixtures/mock-keys.json",
  "reason": "Test fixtures with fake credentials",
  "approvedBy": "security-team",
  "detector": "content"
}
```

**Runtime Access Event:**
```json
{
  "timestamp": "2024-01-15T10:31:00.000Z",
  "type": "runtime_access",
  "workspaceDir": "/home/user/project",
  "runId": "run_abc123",
  "operation": "read",
  "path": ".env",
  "allowed": false,
  "reason": "File matches sensitive pattern"
}
```

---

## Log Rotation

### Rotation Strategy

- **Trigger**: When log file exceeds maxFileSize (default 10MB)
- **Action**: Rename to security.{timestamp}.jsonl
- **Retention**: Keep last N files based on retentionDays config

### Rotation Algorithm

```
1. Check current log file size
2. If size > maxFileSize:
   a. Generate timestamp: YYYYMMDD-HHmmss
   b. Rename security.jsonl → security.{timestamp}.jsonl
   c. Create new security.jsonl
   d. Delete old files beyond retention period
```

### File Naming

```
~/.agentgate/audit/
├── security.jsonl              # Current log
├── security.20240115-103000.jsonl
├── security.20240114-120000.jsonl
└── security.20240113-080000.jsonl
```

---

## Privacy Considerations

### What NOT to Log

By default (includeContent: false):
- Actual secret values (even masked)
- Full file contents
- Stack traces with sensitive paths

### What IS Logged

- File paths (relative)
- Pattern matches (which pattern, not what matched)
- Counts and statistics
- Detector names
- Policy configuration

### Enabling Full Logging

Set `includeContent: true` in audit config:
- Logs masked secret values
- Logs full finding details
- Use only in secure environments
- Consider log encryption
