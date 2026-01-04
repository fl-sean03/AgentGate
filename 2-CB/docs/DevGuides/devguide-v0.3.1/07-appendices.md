# DevGuide v0.3.1: Appendices

**Checklists, File Inventory, and Quick Reference**

---

## A. Complete File Inventory

### A.1 Files Created

| File | Thrust | Description |
|------|--------|-------------|
| `tests/test_api_live.py` | 1 | Real API verification tests |
| `campaign_builder/utils/deps.py` | 2 | Dependency check utilities |
| `tests/test_validation_e2e.py` | 4 | E2E validation tests |
| `tests/test_streaming.py` | 6 | Streaming tests |
| `tests/fixtures/integration/polymer_example/` | 7 | Polymer test workspace |
| `tests/fixtures/integration/silicon_example/` | 7 | Silicon test workspace |
| `tests/fixtures/integration/incomplete_example/` | 7 | Error case workspace |
| `tests/test_cli_integration.py` | 8 | CLI command tests |
| `campaign_builder/agent/errors.py` | 9 | Standardized error system |
| `campaign_builder/agent/health.py` | 10 | Health check system |
| `tests/test_health.py` | 10 | Health check tests |

### A.2 Files Modified

| File | Thrust | Changes |
|------|--------|---------|
| `tests/conftest.py` | 1, 7 | Add markers and fixtures |
| `pyproject.toml` | 1 | Register test markers |
| `tests/test_tools_documents.py` | 2 | Add skip conditions |
| `campaign_builder/agent/tools/validation.py` | 3 | Wire to real validators |
| `campaign_builder/agent/interface.py` | 5 | Add StreamEvent helpers |
| `campaign_builder/agent/adapters/anthropic_raw.py` | 5, 9 | Standardize streaming/errors |
| `campaign_builder/agent/adapters/mock.py` | 5 | Standardize streaming |
| `campaign_builder/agent/factory.py` | 9 | Use standard errors |
| `campaign_builder/cli.py` | 10 | Add health command |

---

## B. Implementation Checklists

### B.1 Phase 1: Testing Infrastructure (Thrusts 1-2)

- [ ] Create `tests/test_api_live.py`
- [ ] Add `@pytest.mark.live_api` to all live tests
- [ ] Add skip condition for missing API key
- [ ] Implement test_basic_query
- [ ] Implement test_tool_calling
- [ ] Implement test_llm_file_analyzer
- [ ] Implement test_llm_campaign_planner
- [ ] Implement test_resilient_provider
- [ ] Register live_api marker in pyproject.toml
- [ ] Create `campaign_builder/utils/deps.py`
- [ ] Implement check_pdf_available()
- [ ] Implement check_excel_available()
- [ ] Add skipif decorators to PDF tests
- [ ] Verify 0 test failures

### B.2 Phase 2: Validation Integration (Thrusts 3-4)

- [ ] Review current validation tool handlers
- [ ] Implement validate_l0 handler → calls validate_l0()
- [ ] Implement validate_lammps_syntax handler → calls validate_l1_lammps()
- [ ] Implement validate_qe_syntax handler → calls validate_l1_qe()
- [ ] Implement validate_engine handler → calls validate_l2()
- [ ] Implement check_physics handler → calls validate_l3()
- [ ] Implement validate_full handler → calls validate_deck()
- [ ] Create `tests/test_validation_e2e.py`
- [ ] Test L0 with clean and placeholder content
- [ ] Test L1 LAMMPS with valid and invalid
- [ ] Test L1 QE with valid and invalid
- [ ] Test L2 graceful skip
- [ ] Test L3 physics warnings
- [ ] Test full pipeline

### B.3 Phase 3: Streaming Standardization (Thrusts 5-6)

- [ ] Add StreamEvent helper functions
- [ ] Map Anthropic events to TEXT_DELTA
- [ ] Map tool events to TOOL_START/TOOL_END
- [ ] Map completion to COMPLETE
- [ ] Update MockAdapter streaming
- [ ] Create `tests/test_streaming.py`
- [ ] Test MockAdapter streaming
- [ ] Test AnthropicAdapter streaming
- [ ] Test event type consistency
- [ ] Test text accumulation

### B.4 Phase 4: Integration Testing (Thrusts 7-8)

- [ ] Create polymer_example/polymer.data
- [ ] Create polymer_example/force_field.xlsx
- [ ] Create polymer_example/README.md
- [ ] Create silicon_example/silicon.cif
- [ ] Create silicon_example/si_scf.in
- [ ] Create silicon_example/pseudopotential_info.txt
- [ ] Create incomplete_example/partial.data
- [ ] Add workspace fixtures to conftest.py
- [ ] Create `tests/test_cli_integration.py`
- [ ] Test analyze command
- [ ] Test generate command
- [ ] Test validate command

### B.5 Phase 5: Production Polish (Thrusts 9-10)

- [ ] Create `campaign_builder/agent/errors.py`
- [ ] Define AgentError base class
- [ ] Define ConfigurationError
- [ ] Define NetworkError
- [ ] Define ValidationError
- [ ] Define ResourceError
- [ ] Define all error codes (E001-E401)
- [ ] Create format_error() helper
- [ ] Update adapters to use standard errors
- [ ] Create `campaign_builder/agent/health.py`
- [ ] Define HealthStatus dataclass
- [ ] Define ComponentStatus dataclass
- [ ] Implement check_system_health()
- [ ] Check API connectivity
- [ ] Check configuration
- [ ] Check workspace access
- [ ] Check engine binaries
- [ ] Add health CLI command
- [ ] Create `tests/test_health.py`

---

## C. Test Markers Reference

### C.1 Available Markers

| Marker | Usage | Description |
|--------|-------|-------------|
| `@pytest.mark.live_api` | Live API tests | Skipped if no API key |
| `@pytest.mark.slow` | Slow tests | Skipped with `-m "not slow"` |
| `@pytest.mark.integration` | Integration tests | Full pipeline tests |

### C.2 Running Specific Tests

```bash
# All tests except live API
pytest tests/ -v

# Only live API tests
pytest tests/ -v -m live_api

# Only integration tests
pytest tests/ -v -m integration

# Exclude slow tests
pytest tests/ -v -m "not slow"
```

---

## D. Error Codes Quick Reference

| Code | Category | Description |
|------|----------|-------------|
| E001 | Config | ANTHROPIC_API_KEY not set |
| E002 | Config | Unknown provider name |
| E003 | Config | Invalid model name |
| E101 | Network | API connection failed |
| E102 | Network | Rate limit exceeded |
| E103 | Network | Authentication failed |
| E104 | Network | Request timeout |
| E201 | Validation | L0 failed - placeholders |
| E202 | Validation | L1 failed - syntax |
| E203 | Validation | L2 failed - engine |
| E204 | Validation | L3 failed - physics |
| E301 | Resource | File not found |
| E302 | Resource | Permission denied |
| E303 | Resource | Path outside workspace |
| E401 | Internal | Unexpected error |

---

## E. Verification Commands

### E.1 Quick Verification

```bash
# Run all tests
pytest tests/ -v --tb=short

# Run with coverage
pytest tests/ --cov=campaign_builder --cov-report=html

# Run live API tests only
pytest tests/test_api_live.py -v
```

### E.2 Health Check

```bash
# Check system health
campaign-builder health

# Verify API connectivity
python -c "
from campaign_builder.agent.factory import get_best_available_provider
p = get_best_available_provider()
print(f'Provider: {p.get_provider_name()}, Available: {p.is_available()}')
"
```

### E.3 Validation Pipeline

```bash
# Validate a file
campaign-builder validate tests/fixtures/lammps/water.data

# Analyze a workspace
campaign-builder analyze tests/fixtures/integration/polymer_example/
```

---

## F. Final Checklist

Before considering v0.3.1 complete:

### F.1 Code Complete
- [ ] All 10 thrusts implemented
- [ ] All files from Section A created/modified
- [ ] All tests from Section B passing

### F.2 Testing Complete
- [ ] Unit tests pass (pytest tests/)
- [ ] Live API tests pass (pytest -m live_api)
- [ ] Integration tests pass
- [ ] No test failures (skips OK for optional deps)

### F.3 Documentation Complete
- [ ] All DevGuide documents written
- [ ] Error codes documented
- [ ] Health check documented

### F.4 Quality Assurance
- [ ] Real API verified working
- [ ] Validation pipeline connected
- [ ] Streaming standardized
- [ ] Error messages clear
- [ ] Health checks accurate

---

## G. Version History

### G.1 v0.3.1 (Current)

**Focus**: Testing, validation integration, production hardening

**New Features**:
- Real API verification test suite
- Validation tool → validator integration
- Standardized streaming events
- Standardized error handling
- Health check system
- Integration test fixtures

**Dependencies**: None new (builds on v0.3.0)

### G.2 v0.3.0 (Previous)

**Focus**: Agent Abstraction Layer

**Features**:
- AgentProvider interface
- Three adapters (Claude SDK, Anthropic, Mock)
- Tool registry with 14 tools
- LLM-powered FileAnalyzer and CampaignPlanner
- Reliability patterns

---

*End of DevGuide v0.3.1 Appendices*
