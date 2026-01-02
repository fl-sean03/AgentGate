# 13: Appendices

## A. API Schema Reference

### Profile Schema

```
Profile {
  name: string (3-50 chars, alphanumeric + dashes)
  description: string | null (max 500 chars)
  extends: string | null (valid profile name)
  config: HarnessConfig (partial)
  createdAt: ISO8601 timestamp
  updatedAt: ISO8601 timestamp
}
```

### HarnessConfig Schema

```
HarnessConfig {
  loopStrategy: {
    mode: "iterative" | "parallel" | "adaptive"
    maxIterations: number (1-20)
  }

  verification: {
    waitForCI: boolean
    skipLevels: ("L0" | "L1" | "L2" | "L3")[]
    localRetryEnabled: boolean
    ciRetryEnabled: boolean
  }

  limits: {
    maxWallClockSeconds: number (60-86400)
    maxTokens: number | null
  }

  github: {
    mode: "fail-fast" | "best-effort" | "disabled"
    createPR: boolean
    baseBranch: string
  }

  agent: {
    type: string
    model: string | null
    temperature: number (0-2) | null
  }
}
```

### Health Schema

```
HealthStatus {
  status: "healthy" | "degraded" | "unhealthy"
  version: string
  uptime: number (seconds)
  timestamp: ISO8601
  limits: {
    maxConcurrentWorkOrders: number
    activeWorkOrders: number
  }
  drivers: {
    [driverName]: {
      available: boolean
      configured: boolean
      lastUsed: ISO8601 | null
    }
  }
  sandbox: {
    enabled: boolean
    provider: "docker" | "local" | "none"
    containerImage: string | null
    healthy: boolean
  }
}
```

### AuditRecord Schema

```
AuditRecord {
  snapshotId: string
  runId: string
  runNumber: number
  profileName: string
  profileChain: string[]
  config: HarnessConfig (resolved)
  capturedAt: ISO8601
}
```

### BuildError Schema

```
BuildError {
  type: BuildErrorType
  message: string
  exitCode: number | null
  stdout: string
  stderr: string
  agentResultFile: string | null
  iteration: number
  timestamp: ISO8601
}

BuildErrorType:
  "BUILD_ERROR" | "TEST_ERROR" | "VERIFICATION_ERROR" |
  "AGENT_ERROR" | "WORKSPACE_ERROR" | "GITHUB_ERROR" |
  "SNAPSHOT_ERROR" | "TIMEOUT_ERROR" | "SYSTEM_ERROR"
```

---

## B. Component Inventory

### New Components (v0.2.20)

| Component | Location | Thrust |
|-----------|----------|--------|
| ProfileCard | components/profiles/ | 1 |
| ProfileList | components/profiles/ | 1 |
| ProfileForm | components/profiles/ | 2 |
| InheritanceTree | components/profiles/ | 1 |
| JsonConfigEditor | components/profiles/ | 2 |
| AuditTimeline | components/audit/ | 4 |
| AuditTimelineEntry | components/audit/ | 4 |
| SnapshotViewer | components/audit/ | 4 |
| ConfigDiff | components/audit/ | 4 |
| AuditSection | components/audit/ | 4 |
| HealthOverview | components/health/ | 5 |
| DriverStatusCard | components/health/ | 5 |
| LimitsGauge | components/health/ | 5 |
| SandboxStatus | components/health/ | 5 |
| ErrorDetail | components/runs/ | 6 |
| OutputViewer | components/runs/ | 6 |
| TriggerRunButton | components/runs/ | 7 |
| TriggerRunDialog | components/runs/ | 7 |
| DateRangePicker | components/filters/ | 8 |
| MultiSelect | components/filters/ | 8 |
| SearchInput | components/filters/ | 8 |
| AdvancedFilters | components/filters/ | 8 |
| FilterPill | components/filters/ | 8 |
| IterationDetail | components/runs/ | 9 |
| AgentOutputTab | components/runs/ | 9 |
| ToolCallsTab | components/runs/ | 9 |
| FilesTab | components/runs/ | 9 |
| VerificationTab | components/runs/ | 9 |
| ThemeToggle | components/common/ | 10 |
| SkipLink | components/common/ | 10 |

### New Pages (v0.2.20)

| Page | Route | Thrust |
|------|-------|--------|
| Profiles | /profiles | 1 |
| ProfileDetail | /profiles/:name | 2 |
| Health | /health | 5 |

### New Hooks (v0.2.20)

| Hook | Purpose | Thrust |
|------|---------|--------|
| useProfiles | Fetch all profiles | 3 |
| useProfile | Fetch single profile | 3 |
| useCreateProfile | Create mutation | 3 |
| useUpdateProfile | Update mutation | 3 |
| useDeleteProfile | Delete mutation | 3 |
| useAudit | Fetch audit records | 4 |
| useHealth | Fetch health status | 5 |
| useTriggerRun | Trigger run mutation | 7 |
| useFilters | Filter state management | 8 |
| useTheme | Theme state | 10 |

### New Contexts (v0.2.20)

| Context | Purpose | Thrust |
|---------|---------|--------|
| ThemeContext | Dark mode state | 10 |

---

## C. Glossary

| Term | Definition |
|------|------------|
| Profile | A named harness configuration that can extend another profile |
| Inheritance | The mechanism by which child profiles receive settings from parent profiles |
| Resolved Config | A configuration with all inherited values merged |
| Audit Trail | Historical record of configuration changes |
| Snapshot | A point-in-time capture of configuration used for a run |
| Health Check | API endpoint that reports system status |
| Driver | An agent implementation (e.g., claude-code-subscription) |
| Sandbox | Isolated execution environment (Docker or local) |
| Verification Level | L0-L3 gates that validate agent output |
| Iteration | A single attempt within a run |
| BuildError | Structured error with type, message, and output |

---

## D. Keyboard Shortcuts

### Global

| Key | Action |
|-----|--------|
| / | Focus search |
| Esc | Close modal/dropdown |
| ? | Show keyboard shortcuts help |

### Navigation

| Key | Action |
|-----|--------|
| g d | Go to Dashboard |
| g w | Go to Work Orders |
| g r | Go to Runs |
| g p | Go to Profiles |
| g h | Go to Health |
| g s | Go to Settings |

### Lists

| Key | Action |
|-----|--------|
| j / ↓ | Next item |
| k / ↑ | Previous item |
| Enter | Open/select item |

### Work Orders

| Key | Action |
|-----|--------|
| n | New work order |
| f | Open filters |
| c | Clear filters |

### Iterations

| Key | Action |
|-----|--------|
| [ | Previous iteration |
| ] | Next iteration |
| Enter | Expand/collapse |

---

## E. Color Tokens

### Semantic Colors

| Token | Light | Dark |
|-------|-------|------|
| --bg-primary | #ffffff | #111827 |
| --bg-secondary | #f9fafb | #1f2937 |
| --bg-tertiary | #f3f4f6 | #374151 |
| --text-primary | #111827 | #f9fafb |
| --text-secondary | #6b7280 | #9ca3af |
| --text-muted | #9ca3af | #6b7280 |
| --border-default | #e5e7eb | #374151 |
| --border-focus | #3b82f6 | #60a5fa |

### Status Colors

| Status | Light | Dark |
|--------|-------|------|
| Success | #10b981 | #34d399 |
| Warning | #f59e0b | #fbbf24 |
| Error | #ef4444 | #f87171 |
| Info | #3b82f6 | #60a5fa |

---

## F. Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 100+ |
| Firefox | 100+ |
| Safari | 15+ |
| Edge | 100+ |
| Mobile Safari | 15+ |
| Chrome Android | 100+ |

### Required Features

- CSS Grid
- CSS Custom Properties
- Flexbox
- ES2020+
- Fetch API
- LocalStorage
- ResizeObserver
- IntersectionObserver

---

## G. Error Codes

### API Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| PROFILE_NOT_FOUND | Profile does not exist | 404 |
| PROFILE_EXISTS | Profile name already taken | 409 |
| PROFILE_PROTECTED | Cannot modify protected profile | 403 |
| VALIDATION_ERROR | Request validation failed | 400 |
| RUN_ALREADY_ACTIVE | Work order has active run | 409 |
| WORK_ORDER_COMPLETE | Cannot trigger for completed WO | 403 |
| CAPACITY_EXCEEDED | Server at capacity | 429 |
| UNAUTHORIZED | Invalid or missing API key | 401 |

### Client Error Codes

| Code | Description |
|------|-------------|
| NETWORK_ERROR | Could not connect to server |
| TIMEOUT | Request timed out |
| PARSE_ERROR | Could not parse response |

---

## H. Related Documents

| Document | Description |
|----------|-------------|
| DevGuide v0.2.19 | Observability & Reliability (prerequisite) |
| DevGuide v0.2.21 | Terminal UI (builds on dashboard API) |
| API Documentation | Full API reference |
| packages/shared types | Shared TypeScript types |

---

## I. Changelog Template

When completing thrusts, add entries here:

```
## v0.2.20 Changelog

### Added
- Profile management UI (Thrusts 1-3)
- Audit trail viewer (Thrust 4)
- Health dashboard (Thrust 5)
- Enhanced error display (Thrust 6)
- Run trigger functionality (Thrust 7)
- Advanced filtering (Thrust 8)
- Iteration detail view (Thrust 9)
- Dark mode support (Thrust 10)
- Responsive mobile layout (Thrust 10)
- Accessibility improvements (Thrust 10)

### Changed
- [List any modifications to existing functionality]

### Fixed
- [List any bug fixes]
```
