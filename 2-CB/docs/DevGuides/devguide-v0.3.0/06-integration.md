# DevGuide v0.3.0: Integration and Reliability

**Thrusts 12-13: End-to-End Testing and Production Hardening**

---

## Thrust 12: End-to-End Integration

### 12.1 Objective

Verify that all components work together correctly through comprehensive end-to-end testing with real LLM calls.

### 12.2 Background

Individual components have been tested in isolation. Now we need to verify:
- CLI commands work end-to-end
- Runner coordinates agents correctly
- Generated files are actually valid
- The full pipeline produces correct results

### 12.3 Subtasks

#### 12.3.1 Create integration test fixtures

Create test workspace with realistic simulation files:

**Directory: tests/fixtures/integration/**
- `polymer_example/` - Polymer MD simulation
  - `polymer.data` - LAMMPS data file
  - `force_field.xlsx` - Parameter spreadsheet
  - `notes.pdf` - Documentation PDF

- `silicon_example/` - QE DFT calculation
  - `si.cif` - Crystal structure
  - `pseudopotential_info.txt` - PP documentation

These should be real, valid files that exercise the full pipeline.

#### 12.3.2 CLI analyze integration test

Test the analyze command end-to-end:

**Test: test_cli_analyze_polymer_workspace**
1. Run: `campaign-builder analyze tests/fixtures/integration/polymer_example/`
2. Verify:
   - Exit code 0
   - 3 files analyzed
   - FileGuides contain expected information
   - No errors in output

**Test: test_cli_analyze_with_json_output**
1. Run: `campaign-builder analyze ./workspace --json`
2. Verify:
   - Valid JSON output
   - Contains all FileGuide fields
   - Can be parsed programmatically

#### 12.3.3 CLI generate integration test

Test the generate command end-to-end:

**Test: test_cli_generate_nvt_equilibration**
1. Run: `campaign-builder generate ./polymer_example "NVT equilibration at 300K for 1ns"`
2. Verify:
   - Exit code 0
   - Input file created in output directory
   - File contains NVT fix at 300K
   - File references correct data file
   - L1 validation passes

**Test: test_cli_generate_with_missing_info**
1. Run: `campaign-builder generate ./incomplete_example "Run MD simulation"`
2. Verify:
   - Appropriate warnings displayed
   - Assumptions documented
   - Either valid file with defaults OR clear error

#### 12.3.4 CLI validate integration test

Test the validate command end-to-end:

**Test: test_cli_validate_generated_file**
1. Generate a file using the generate command
2. Run: `campaign-builder validate ./output/in.nvt`
3. Verify:
   - All validation levels run
   - L0: No placeholders
   - L1: Valid syntax
   - L2: Engine accepts (if available)
   - L3: Physics checks pass

#### 12.3.5 Full pipeline integration test

Test complete workflow:

**Test: test_full_pipeline_polymer_md**
1. Start with raw workspace files
2. Run analyze → capture FileGuides
3. Run generate with specific intent
4. Run validate on output
5. Verify:
   - Pipeline completes without errors
   - Output files are usable
   - Provenance is tracked
   - README is generated
   - Manifest is generated

#### 12.3.6 Cross-adapter consistency test

Verify results are consistent across adapters:

**Test: test_adapter_consistency**
1. Run same analysis with each adapter:
   - claude_sdk
   - anthropic
   - mock (for structure only)
2. Verify:
   - Same file types detected
   - Similar key information extracted
   - No adapter-specific bugs

### 12.4 Verification Steps

1. Run integration test suite:
   ```
   pytest tests/test_integration.py -v --tb=long
   ```
   Expected: All integration tests pass

2. Test CLI manually:
   ```
   cd tests/fixtures/integration/polymer_example
   campaign-builder analyze .
   campaign-builder generate . "Minimize then equilibrate at 300K"
   campaign-builder validate output/in.minimize
   ```
   Expected: All commands succeed with meaningful output

3. Verify generated files:
   ```
   # Check generated file has required commands
   grep -E "units|atom_style|pair_style|run" output/in.minimize
   ```
   Expected: All required LAMMPS commands present

4. Test with actual LAMMPS (if available):
   ```
   $LAMMPS_BINARY -in output/in.minimize -log none
   ```
   Expected: LAMMPS accepts input (may fail due to missing data, but syntax OK)

### 12.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/fixtures/integration/` | Created | Integration test fixtures |
| `tests/test_integration.py` | Created | End-to-end tests |
| `tests/conftest.py` | Modified | Add integration fixtures |

---

## Thrust 13: Reliability and Fallback

### 13.1 Objective

Harden the system for production use with proper error handling, retries, timeouts, and graceful degradation.

### 13.2 Background

Production systems must handle:
- API outages and rate limits
- Network failures
- Malformed LLM responses
- Timeout conditions
- Resource exhaustion

The system should degrade gracefully rather than fail completely.

### 13.3 Subtasks

#### 13.3.1 Implement retry logic

Add retry wrapper for API calls:

**retry_with_backoff(func, max_retries=3, base_delay=1.0)**

Retry logic:
1. Call function
2. If RateLimitError: wait 2^n seconds, retry
3. If ConnectionError: wait 1 second, retry
4. If other error: raise immediately
5. After max_retries: raise last error

Apply to:
- All provider.run() calls
- All provider.stream() calls

#### 13.3.2 Add timeout handling

Ensure all operations have timeouts:

**Timeout configuration:**
- File analysis: 60 seconds per file
- Campaign planning: 180 seconds total
- Validation L2: 30 seconds per check
- Overall pipeline: configurable (default 300s)

**Timeout handling:**
- Cancel running operation
- Return partial result if available
- Log timeout with context
- Set error code for timeout

#### 13.3.3 Implement graceful degradation

When LLM is unavailable, system should still work:

**Degradation levels:**

Level 1 (Full LLM):
- LLM analyzes files
- LLM generates campaigns
- Full semantic understanding

Level 2 (Partial LLM):
- LLM unavailable for some operations
- Fall back to deterministic for affected parts
- Clear warnings about reduced capability

Level 3 (No LLM):
- Pure deterministic mode
- All parsing is regex-based
- Templates for generation
- System still functional

**Degradation triggers:**
- API key missing → Level 3
- API errors → Retry, then Level 2
- Timeout → Level 2 for that file

#### 13.3.4 Add health checks

Create health check endpoint/function:

**check_system_health() -> HealthStatus**

Checks:
- API key configured
- API reachable (cached, refresh every 5 min)
- Workspace readable
- Output directory writable
- Engine binaries available

Returns status object with:
- overall_status: healthy/degraded/unavailable
- component_status: dict of component → status
- recommendations: list of actions to fix issues

#### 13.3.5 Improve error messages

Standardize error messages for user clarity:

**Error message format:**
```
Error: [Category] - [Short description]

Details: [Longer explanation]

Suggestion: [What to try]

Error code: E[NNN]
```

**Error categories:**
- Configuration: Missing or invalid settings
- Network: API connectivity issues
- Validation: Invalid input or output
- Resource: File access or permission issues
- Internal: Unexpected system errors

#### 13.3.6 Add telemetry and logging

Implement structured logging:

**Log levels:**
- DEBUG: Detailed operation trace
- INFO: Normal operation events
- WARNING: Degradation or recoverable issues
- ERROR: Operation failures

**Log format:**
```json
{
  "timestamp": "2025-12-28T10:30:00Z",
  "level": "INFO",
  "component": "file_analyzer",
  "operation": "analyze",
  "file": "polymer.data",
  "duration_ms": 1234,
  "provider": "claude_sdk",
  "success": true
}
```

**Metrics to track:**
- Operation count by type
- Success/failure rates
- Average duration by operation
- API calls and tokens used
- Fallback frequency

### 13.4 Verification Steps

1. Test retry logic:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.factory import get_provider
   from campaign_builder.agent.config import load_config

   async def test():
       # Temporarily break API key to test retry
       import os
       original_key = os.environ.get('ANTHROPIC_API_KEY')
       os.environ['ANTHROPIC_API_KEY'] = 'invalid-key'

       try:
           provider = get_provider()
           result = await provider.run(
               prompt='test',
               system_prompt='test',
               tools=[]
           )
       except Exception as e:
           print(f'Expected error after retries: {type(e).__name__}')
       finally:
           if original_key:
               os.environ['ANTHROPIC_API_KEY'] = original_key

   asyncio.run(test())
   "
   ```
   Expected: AuthenticationError after retries

2. Test timeout handling:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.factory import get_provider

   async def test():
       provider = get_provider()
       try:
           result = await asyncio.wait_for(
               provider.run(
                   prompt='Write a 10000 word essay',  # Long task
                   system_prompt='Be verbose',
                   tools=[]
               ),
               timeout=5.0  # Short timeout
           )
       except asyncio.TimeoutError:
           print('Timeout handled correctly')

   asyncio.run(test())
   "
   ```
   Expected: "Timeout handled correctly"

3. Test graceful degradation:
   ```
   AGENT_PROVIDER=mock python -c "
   import asyncio
   from campaign_builder.agent.file_analyzer import analyze_file
   from pathlib import Path

   async def test():
       result = await analyze_file(
           Path('/tmp/test_workspace/test.data'),
           use_llm=True  # Will use mock, simulating degradation
       )
       print(f'Success: {result.success}')
       print(f'Method: mock adapter')

   asyncio.run(test())
   "
   ```
   Expected: Successful analysis via mock

4. Test health check:
   ```
   python -c "
   from campaign_builder.agent.health import check_system_health

   status = check_system_health()
   print(f'Overall: {status.overall_status}')
   for component, state in status.component_status.items():
       print(f'  {component}: {state}')
   "
   ```
   Expected: Health status report

5. Run reliability tests:
   ```
   pytest tests/test_reliability.py -v
   ```
   Expected: All reliability tests pass

### 13.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/retry.py` | Created | Retry logic |
| `campaign_builder/agent/health.py` | Created | Health checks |
| `campaign_builder/logging_config.py` | Created | Logging setup |
| `tests/test_reliability.py` | Created | Reliability tests |
| `campaign_builder/agent/file_analyzer.py` | Modified | Add timeout/fallback |
| `campaign_builder/agent/campaign_planner.py` | Modified | Add timeout/fallback |

---

## Phase 5 Completion Checklist

Before considering v0.3.0 complete, verify:

- [ ] All integration tests pass
- [ ] CLI commands work end-to-end
- [ ] Generated files are valid and usable
- [ ] Retry logic handles transient failures
- [ ] Timeouts prevent hanging operations
- [ ] System degrades gracefully without API
- [ ] Health checks report accurate status
- [ ] Error messages are clear and actionable
- [ ] Logging provides useful debugging info
- [ ] All 354+ original tests still pass
- [ ] New tests bring coverage to 80%+

---

## Final Verification

Run complete test suite:
```bash
# Unit tests
pytest tests/ -v --tb=short

# Integration tests (requires API key)
pytest tests/test_integration.py -v

# Reliability tests
pytest tests/test_reliability.py -v

# Coverage report
pytest tests/ --cov=campaign_builder --cov-report=html
```

All tests must pass before marking v0.3.0 complete.

---

## Next Document

See [07-appendices.md](./07-appendices.md) for checklists, file references, and examples.
