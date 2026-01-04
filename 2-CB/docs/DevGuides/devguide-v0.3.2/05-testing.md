# Test Suite

## Thrust 7: Unit Tests

### 7.1 Objective
Create comprehensive unit tests for all modules.

### 7.2 Subtasks

#### 7.2.1 Create Test Directory Structure
Create `tests/reaper/` with:
- `conftest.py` - Shared fixtures
- `test_schemas.py` - Schema tests
- `test_provider.py` - Provider tests (mocked)
- `test_generator.py` - Generator tests
- `test_validation.py` - Validation tests

#### 7.2.2 Implement Schema Tests
Test all dataclasses:
- ReaperInput validation
- ReaperOutput creation
- ValidationResult aggregation
- Serialization to dict

#### 7.2.3 Implement Provider Tests (Mocked)
Test provider with mocked API:
- Connection handling
- Retry logic
- Error handling
- Response parsing

#### 7.2.4 Implement Generator Tests
Test generation logic:
- Context building from files
- Prompt construction
- Post-processing of LLM output
- Error handling

#### 7.2.5 Implement Validation Tests
Test each validation level:
- L0 placeholder detection
- L1 syntax validation
- L2 engine check (mocked binary)
- L3 physics checks
- Unified validation pipeline

### 7.3 Verification Steps
1. Run `pytest tests/reaper/ -v`
2. All tests should pass
3. Coverage should be >80%

### 7.4 Files Created
| File | Action |
|------|--------|
| `tests/reaper/conftest.py` | Created |
| `tests/reaper/test_schemas.py` | Created |
| `tests/reaper/test_provider.py` | Created |
| `tests/reaper/test_generator.py` | Created |
| `tests/reaper/test_validation.py` | Created |

---

## Thrust 8: Live API Tests

### 8.1 Objective
Create integration tests with real Anthropic API and LAMMPS.

### 8.2 Subtasks

#### 8.2.1 Create Live Test File
Create `tests/reaper/test_live_api.py` with:
- Skip decorator for missing API key
- Timeout handling for slow responses
- Real API call tests

#### 8.2.2 Implement Provider Connectivity Test
Test real API connection:
- Simple health check query
- Verify response received
- Measure latency

#### 8.2.3 Implement Generation Test
Test end-to-end generation:
- Generate LJ simulation deck
- Verify deck content is valid
- Run through L0-L1 validation

#### 8.2.4 Implement Full Pipeline Test
Test complete workflow:
- Generate deck with LLM
- Validate through L0-L3
- Execute with real LAMMPS (if available)
- Verify simulation completes

#### 8.2.5 Implement Context Test
Test generation with input files:
- Provide sample data file
- Generate deck referencing file
- Verify deck uses file correctly

#### 8.2.6 Add LAMMPS Execution Test
Test real LAMMPS execution:
- Skip if binary not available
- Run generated deck
- Verify successful completion
- Check output files created

### 8.3 Verification Steps
1. Set `ANTHROPIC_API_KEY` environment variable
2. Run `pytest tests/reaper/test_live_api.py -v`
3. All tests should pass (or skip if deps missing)
4. Measure and report API latency

### 8.4 Files Created
| File | Action |
|------|--------|
| `tests/reaper/test_live_api.py` | Created |

---

## Navigation

⬅️ **Previous**: [04-validation.md](./04-validation.md)
➡️ **Next**: [06-appendices.md](./06-appendices.md) — Appendices
