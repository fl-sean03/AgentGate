# DevGuide v0.3.1: Production Polish

**Thrusts 9-10: Error Standardization and Health Checks**

---

## Thrust 9: Error Message Standardization

### 9.1 Objective

Create a standardized error handling system with consistent error codes, messages, and suggestions.

### 9.2 Background

Currently errors are raised with various messages. A standardized system provides:
- Consistent error codes for programmatic handling
- Clear messages for users
- Actionable suggestions for resolution
- Proper logging integration

### 9.3 Subtasks

#### 9.3.1 Create error module

Create `campaign_builder/agent/errors.py` with:

**Error code format**: `E[Category][Number]`
- Category C (001-099): Configuration errors
- Category N (100-199): Network/API errors
- Category V (200-299): Validation errors
- Category R (300-399): Resource errors
- Category I (400-499): Internal errors

#### 9.3.2 Define error classes

Create base class:

**AgentError(Exception)**
- code: str (e.g., "E001")
- category: str (e.g., "Configuration")
- message: str
- suggestion: str
- details: Optional[dict]

Create specific subclasses:
- **ConfigurationError** - Missing/invalid config
- **NetworkError** - API connectivity issues
- **ValidationError** - Validation failures
- **ResourceError** - File/path issues
- **InternalError** - Unexpected errors

#### 9.3.3 Create error code registry

Define all error codes:

| Code | Category | Description | Suggestion |
|------|----------|-------------|------------|
| E001 | Config | API key not set | Set ANTHROPIC_API_KEY |
| E002 | Config | Unknown provider | Use claude_sdk, anthropic, or mock |
| E101 | Network | Connection failed | Check network |
| E102 | Network | Rate limit | Wait and retry |
| E103 | Network | Auth failed | Check API key |
| E201 | Validation | L0 failed | Remove placeholders |
| E202 | Validation | L1 syntax error | Fix syntax |
| E301 | Resource | File not found | Check path |
| E302 | Resource | Permission denied | Check permissions |
| E401 | Internal | Unexpected error | Report bug |

#### 9.3.4 Update adapters to use errors

Modify adapters to raise standardized errors:
- AnthropicAdapter: NetworkError for API issues
- Factory: ConfigurationError for missing provider
- FileAnalyzer: ResourceError for file issues

#### 9.3.5 Add error formatting

Create helper function:

**format_error(error: AgentError) -> str**

Returns formatted string:
```
Error: [Category] - [Description]

Details: [Longer explanation]

Suggestion: [What to try]

Error code: E[NNN]
```

### 9.4 Verification Steps

1. Test error creation:
   ```python
   from campaign_builder.agent.errors import ConfigurationError

   error = ConfigurationError(
       code="E001",
       message="API key not set",
       suggestion="Set ANTHROPIC_API_KEY in .env"
   )
   print(error.format())
   ```
   Expected: Formatted error message

2. Test error raising:
   ```python
   from campaign_builder.agent.factory import get_provider
   import os

   os.environ.pop("ANTHROPIC_API_KEY", None)
   try:
       get_provider()
   except ConfigurationError as e:
       print(f"Caught: {e.code} - {e.message}")
   ```
   Expected: ConfigurationError with E001

3. Verify in tests:
   ```bash
   pytest tests/test_agent_integration.py::TestErrorHandling -v
   ```
   Expected: Error tests pass

### 9.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/errors.py` | Created | Error system |
| `campaign_builder/agent/adapters/anthropic_raw.py` | Modified | Use standard errors |
| `campaign_builder/agent/factory.py` | Modified | Use standard errors |

---

## Thrust 10: Health Check Implementation

### 10.1 Objective

Implement a health check system that reports system status for production monitoring.

### 10.2 Background

Production systems need health checks to:
- Verify dependencies are working
- Report degraded states
- Enable monitoring integration
- Provide troubleshooting info

### 10.3 Subtasks

#### 10.3.1 Create health module

Create `campaign_builder/agent/health.py` with:

**HealthStatus dataclass**
- overall_status: Literal["healthy", "degraded", "unavailable"]
- component_status: Dict[str, ComponentStatus]
- recommendations: List[str]
- checked_at: datetime

**ComponentStatus dataclass**
- name: str
- status: Literal["ok", "degraded", "error"]
- message: str
- details: Optional[dict]

#### 10.3.2 Implement check_system_health()

Function that checks:

**API Connectivity**
- Try simple API call with short timeout
- Cache result for 5 minutes
- Status: ok if responds, error if not

**Configuration**
- Check ANTHROPIC_API_KEY is set
- Check model name is valid
- Status: ok if all set, degraded if optional missing

**Workspace**
- Check current directory is readable
- Check output directory is writable
- Status: ok if accessible, error if not

**Engine Binaries**
- Check LAMMPS_BINARY if set
- Check QE_BINARY if set
- Status: ok if available, degraded if not set

#### 10.3.3 Add health endpoint/command

Create CLI command:

```bash
campaign-builder health
```

Output:
```
Campaign Builder Health Check
=============================

Overall Status: HEALTHY

Components:
  [OK] API Connectivity - Response time: 245ms
  [OK] Configuration - All required settings present
  [OK] Workspace - Read/write access confirmed
  [DEGRADED] Engine Binaries - LAMMPS not configured

Recommendations:
  - Set LAMMPS_BINARY for L2 validation

Checked at: 2025-12-28T15:30:00Z
```

#### 10.3.4 Add health check tests

Create tests for:
- check_system_health() returns valid status
- Component checks work individually
- Degraded state detected correctly
- Recommendations generated

### 10.4 Verification Steps

1. Test health check:
   ```python
   from campaign_builder.agent.health import check_system_health

   status = check_system_health()
   print(f"Overall: {status.overall_status}")
   for name, comp in status.component_status.items():
       print(f"  {name}: {comp.status}")
   ```
   Expected: Status report generated

2. Test CLI:
   ```bash
   campaign-builder health
   ```
   Expected: Formatted health report

3. Test with missing config:
   ```bash
   ANTHROPIC_API_KEY= campaign-builder health
   ```
   Expected: Shows degraded/unavailable status

### 10.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/health.py` | Created | Health check system |
| `campaign_builder/cli.py` | Modified | Add health command |
| `tests/test_health.py` | Created | Health check tests |

---

## Phase 5 Completion Checklist

Before considering v0.3.1 complete, verify:

- [ ] AgentError base class created
- [ ] All error codes defined
- [ ] Adapters use standard errors
- [ ] HealthStatus dataclass created
- [ ] check_system_health() implemented
- [ ] Health CLI command works
- [ ] Health tests pass

---

## Final Verification

Run complete test suite:
```bash
# All tests
pytest tests/ -v --tb=short

# Coverage report
pytest tests/ --cov=campaign_builder --cov-report=html
```

Expected:
- 0 failures
- 80%+ coverage
- All new features verified

---

## Next Document

Continue to [07-appendices.md](./07-appendices.md) for checklists and file inventory.
