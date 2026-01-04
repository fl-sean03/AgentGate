# DevGuide v0.3.0: Appendices

**Checklists, File References, and Examples**

---

## A. Complete File Inventory

### A.1 Files Created

| File | Thrust | Description |
|------|--------|-------------|
| `campaign_builder/agent/__init__.py` | 1 | Agent package init |
| `campaign_builder/agent/interface.py` | 1 | AgentProvider, AgentResult, ToolCall |
| `campaign_builder/agent/tools.py` | 2 | ToolDefinition, ToolError, helpers |
| `campaign_builder/agent/registry.py` | 2 | ToolRegistry, default_registry |
| `campaign_builder/agent/config.py` | 3 | AgentEnvironment, load_config |
| `campaign_builder/agent/factory.py` | 3 | get_provider, provider registry |
| `campaign_builder/agent/adapters/__init__.py` | 4 | Adapters package init |
| `campaign_builder/agent/adapters/claude_sdk.py` | 4 | ClaudeSDKAdapter |
| `campaign_builder/agent/adapters/anthropic_raw.py` | 5 | AnthropicAdapter |
| `campaign_builder/agent/adapters/mock.py` | 6 | MockAdapter |
| `campaign_builder/agent/tools/__init__.py` | 7 | Tools subpackage init |
| `campaign_builder/agent/tools/documents.py` | 7 | Document tool wrappers |
| `campaign_builder/agent/tools/validation.py` | 8 | Validation tool wrappers |
| `campaign_builder/agent/tools/utilities.py` | 9 | Utility tool wrappers |
| `campaign_builder/agent/retry.py` | 13 | Retry logic with backoff |
| `campaign_builder/agent/health.py` | 13 | Health check system |
| `campaign_builder/logging_config.py` | 13 | Structured logging setup |
| `tests/test_agent_interface.py` | 1 | Interface contract tests |
| `tests/test_agent_tools.py` | 2 | Tool system tests |
| `tests/test_agent_config.py` | 3 | Configuration tests |
| `tests/test_agent_factory.py` | 3 | Factory tests |
| `tests/test_adapter_claude_sdk.py` | 4 | Claude SDK adapter tests |
| `tests/test_adapter_anthropic.py` | 5 | Anthropic adapter tests |
| `tests/test_adapter_mock.py` | 6 | Mock adapter tests |
| `tests/test_tools_documents_registered.py` | 7 | Document tool tests |
| `tests/test_tools_validation_registered.py` | 8 | Validation tool tests |
| `tests/test_tools_utilities_registered.py` | 9 | Utility tool tests |
| `tests/test_integration.py` | 12 | End-to-end integration tests |
| `tests/test_reliability.py` | 13 | Reliability tests |
| `tests/fixtures/integration/` | 12 | Integration test fixtures |

### A.2 Files Modified

| File | Thrust | Changes |
|------|--------|---------|
| `campaign_builder/agent/file_analyzer.py` | 10, 13 | Add LLM analysis, timeout/fallback |
| `campaign_builder/agent/campaign_planner.py` | 11, 13 | Add LLM planning, timeout/fallback |
| `.env` | 3 | Add all agent configuration options |
| `tests/conftest.py` | 12 | Add integration fixtures |
| `pyproject.toml` | - | Verify claude-agent-sdk dependency |

---

## B. Implementation Checklists

### B.1 Phase 1: Foundation (Thrusts 1-3)

**Thrust 1: Agent Interface**
- [ ] Create `campaign_builder/agent/__init__.py`
- [ ] Create `interface.py` with AgentResult dataclass
- [ ] Create `interface.py` with ToolCall dataclass
- [ ] Create `interface.py` with AgentProvider abstract class
- [ ] Define StreamEvent types (TextDelta, ToolStart, ToolEnd, etc.)
- [ ] Add AgentConfig dataclass
- [ ] Create `tests/test_agent_interface.py`
- [ ] Verify AgentProvider cannot be instantiated directly

**Thrust 2: Tool Definition System**
- [ ] Create `tools.py` with ToolDefinition dataclass
- [ ] Add ToolError exception class
- [ ] Create `registry.py` with ToolRegistry class
- [ ] Add default_registry singleton
- [ ] Add register_tool decorator
- [ ] Add parameter schema helpers (string_param, etc.)
- [ ] Create `tests/test_agent_tools.py`
- [ ] Verify tools can be registered and retrieved

**Thrust 3: Configuration and Factory**
- [ ] Create `config.py` with AgentEnvironment dataclass
- [ ] Implement load_config() function
- [ ] Add .env file documentation
- [ ] Create `factory.py` with get_provider()
- [ ] Add provider registry dictionary
- [ ] Add list_providers() function
- [ ] Add ConfigurationError exception
- [ ] Create `tests/test_agent_config.py`
- [ ] Create `tests/test_agent_factory.py`

### B.2 Phase 2: Adapters (Thrusts 4-6)

**Thrust 4: Claude Agent SDK Adapter**
- [ ] Create `adapters/__init__.py`
- [ ] Create `adapters/claude_sdk.py` with ClaudeSDKAdapter
- [ ] Implement run() method
- [ ] Implement stream() method
- [ ] Implement tool conversion to SDK format
- [ ] Handle SDK-specific errors (CLINotFoundError, etc.)
- [ ] Implement is_available() check
- [ ] Create `tests/test_adapter_claude_sdk.py`
- [ ] Test with real API (basic query)
- [ ] Test with built-in tools (Read)

**Thrust 5: Anthropic Raw Adapter**
- [ ] Create `adapters/anthropic_raw.py` with AnthropicAdapter
- [ ] Implement agentic loop in run()
- [ ] Handle tool_use stop_reason
- [ ] Convert ToolDefinition to Anthropic format
- [ ] Create tool_result messages
- [ ] Implement stream() method
- [ ] Add retry logic for transient errors
- [ ] Handle authentication errors
- [ ] Create `tests/test_adapter_anthropic.py`
- [ ] Test with custom tool

**Thrust 6: Mock Adapter**
- [ ] Create `adapters/mock.py` with MockAdapter
- [ ] Implement response matching
- [ ] Add response_map configuration
- [ ] Implement tool execution (real or mocked)
- [ ] Add interaction recording
- [ ] Add helper methods (get_last_interaction, etc.)
- [ ] Implement streaming simulation
- [ ] Create `tests/test_adapter_mock.py`

### B.3 Phase 3: Tool Migration (Thrusts 7-9)

**Thrust 7: Document Tools**
- [ ] Create `tools/documents.py`
- [ ] Wrap read_pdf with ToolDefinition
- [ ] Wrap read_excel with ToolDefinition
- [ ] Wrap read_csv with ToolDefinition
- [ ] Add error handling to each tool
- [ ] Add output formatting (truncation, etc.)
- [ ] Register tools on import
- [ ] Create `tests/test_tools_documents_registered.py`

**Thrust 8: Validation Tools**
- [ ] Create `tools/validation.py`
- [ ] Create validate_l0 tool
- [ ] Create validate_lammps_syntax tool
- [ ] Create validate_qe_syntax tool
- [ ] Create validate_engine tool
- [ ] Create check_physics tool
- [ ] Create validate_full tool
- [ ] Format output as JSON for LLM
- [ ] Handle engine binary paths
- [ ] Register all tools
- [ ] Create `tests/test_tools_validation_registered.py`

**Thrust 9: Utility Tools**
- [ ] Create `tools/utilities.py`
- [ ] Create read_file tool
- [ ] Create write_file tool
- [ ] Create glob_files tool
- [ ] Create grep_content tool
- [ ] Create get_file_info tool
- [ ] Implement is_safe_path() security helper
- [ ] Add path restriction enforcement
- [ ] Register all tools
- [ ] Create `tests/test_tools_utilities_registered.py`
- [ ] Test path safety

### B.4 Phase 4: Agent LLM Integration (Thrusts 10-11)

**Thrust 10: FileAnalyzer LLM Integration**
- [ ] Add analyze_file_llm() function
- [ ] Create analysis prompt template
- [ ] Implement parse_file_guide_response()
- [ ] Handle JSON extraction from markdown
- [ ] Add retry logic for parsing failures
- [ ] Make tools available (read_file, validate)
- [ ] Modify analyze_file() for fallback
- [ ] Update analyze_all_files() for batch processing
- [ ] Add tests for LLM analysis
- [ ] Verify fallback to deterministic works

**Thrust 11: CampaignPlanner LLM Integration**
- [ ] Add run_campaign_planner_llm() function
- [ ] Format FileGuides as context
- [ ] Build planning prompt with intent
- [ ] Implement validation loop (up to 3 iterations)
- [ ] Handle missing information gracefully
- [ ] Document assumptions in result
- [ ] Collect generated files
- [ ] Modify run_campaign_planner() for fallback
- [ ] Add tests for LLM planning
- [ ] Test validation iteration

### B.5 Phase 5: Integration & Reliability (Thrusts 12-13)

**Thrust 12: End-to-End Integration**
- [ ] Create `tests/fixtures/integration/polymer_example/`
- [ ] Create `tests/fixtures/integration/silicon_example/`
- [ ] Add realistic simulation files
- [ ] Create `tests/test_integration.py`
- [ ] Test CLI analyze command end-to-end
- [ ] Test CLI generate command end-to-end
- [ ] Test CLI validate command end-to-end
- [ ] Test full pipeline workflow
- [ ] Test cross-adapter consistency
- [ ] Update `tests/conftest.py` with fixtures

**Thrust 13: Reliability and Fallback**
- [ ] Create `retry.py` with retry_with_backoff()
- [ ] Apply retry logic to provider calls
- [ ] Add timeout configuration
- [ ] Implement timeout handling
- [ ] Define degradation levels
- [ ] Implement graceful degradation
- [ ] Create `health.py` with check_system_health()
- [ ] Implement component health checks
- [ ] Standardize error message format
- [ ] Implement structured logging
- [ ] Create `tests/test_reliability.py`

---

## C. Environment Configuration Reference

### C.1 Complete .env Template

```bash
# =============================================================================
# Campaign Builder Agent Configuration
# =============================================================================

# -----------------------------------------------------------------------------
# Provider Selection
# -----------------------------------------------------------------------------
# Which LLM provider adapter to use
# Options: claude_sdk, anthropic, mock
AGENT_PROVIDER=claude_sdk

# -----------------------------------------------------------------------------
# API Configuration
# -----------------------------------------------------------------------------
# Anthropic API key (required for claude_sdk and anthropic providers)
ANTHROPIC_API_KEY=sk-ant-...

# Model to use for LLM calls
# Recommended: claude-sonnet-4-20250514 (fast, capable)
# Alternative: claude-opus-4-20250514 (more capable, slower)
CLAUDE_MODEL=claude-sonnet-4-20250514

# -----------------------------------------------------------------------------
# Agent Behavior
# -----------------------------------------------------------------------------
# Maximum number of tool-calling iterations before stopping
AGENT_MAX_ITERATIONS=10

# Timeout in seconds for agent operations
AGENT_TIMEOUT=120

# Maximum tokens for LLM responses
AGENT_MAX_TOKENS=4096

# Temperature for LLM sampling (0.0 = deterministic)
AGENT_TEMPERATURE=0.0

# -----------------------------------------------------------------------------
# Engine Binaries (for L2 Validation)
# -----------------------------------------------------------------------------
# Path to LAMMPS binary (optional, L2 skipped if not set)
LAMMPS_BINARY=/path/to/lmp

# Path to Quantum ESPRESSO pw.x binary (optional, L2 skipped if not set)
QE_BINARY=/path/to/pw.x

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
# Log level: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL=INFO

# Log format: json, text
LOG_FORMAT=text

# Log file path (optional, logs to stderr if not set)
LOG_FILE=

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------
# Enable debug mode (more verbose output)
DEBUG=false

# Working directory for agent operations (default: current directory)
WORKSPACE_DIR=
```

### C.2 Environment Variable Precedence

1. Environment variables (highest priority)
2. `.env` file in current directory
3. `.env` file in project root
4. Default values (lowest priority)

---

## D. Testing Commands Reference

### D.1 Quick Verification

```bash
# Run all unit tests
pytest tests/ -v --tb=short

# Run with coverage
pytest tests/ --cov=campaign_builder --cov-report=html

# Run only agent tests
pytest tests/test_agent*.py tests/test_adapter*.py -v

# Run only tool tests
pytest tests/test_tools*.py -v
```

### D.2 Integration Testing

```bash
# Run integration tests (requires API key)
pytest tests/test_integration.py -v --tb=long

# Run reliability tests
pytest tests/test_reliability.py -v

# Run with specific provider
AGENT_PROVIDER=anthropic pytest tests/test_integration.py -v
AGENT_PROVIDER=mock pytest tests/test_integration.py -v
```

### D.3 Manual CLI Testing

```bash
# Test analyze command
cd tests/fixtures/integration/polymer_example
campaign-builder analyze .

# Test generate command
campaign-builder generate . "NVT equilibration at 300K for 1ns"

# Test validate command
campaign-builder validate output/in.nvt

# Check JSON output
campaign-builder analyze . --json | python -m json.tool
```

### D.4 Provider-Specific Testing

```bash
# Test Claude SDK adapter
python -c "
import asyncio
from campaign_builder.agent.factory import get_provider

async def test():
    provider = get_provider()
    print(f'Provider: {provider.get_provider_name()}')
    print(f'Available: {provider.is_available()}')

    result = await provider.run(
        prompt='What is 2+2?',
        system_prompt='Be concise.',
        tools=[]
    )
    print(f'Result: {result.content}')

asyncio.run(test())
"

# Test with mock provider (no API key needed)
AGENT_PROVIDER=mock python -c "
import asyncio
from campaign_builder.agent.factory import get_provider

async def test():
    provider = get_provider()
    print(f'Provider: {provider.get_provider_name()}')
    result = await provider.run(
        prompt='test',
        system_prompt='test',
        tools=[]
    )
    print(f'Success: {result.success}')

asyncio.run(test())
"
```

---

## E. Error Codes Reference

### E.1 Error Code Format

```
E[Category][Number]

Categories:
- C: Configuration errors (E001-E099)
- N: Network/API errors (E100-E199)
- V: Validation errors (E200-E299)
- R: Resource errors (E300-E399)
- I: Internal errors (E400-E499)
```

### E.2 Error Code List

| Code | Category | Description | Suggestion |
|------|----------|-------------|------------|
| E001 | Config | ANTHROPIC_API_KEY not set | Set the API key in .env or environment |
| E002 | Config | Unknown provider name | Use claude_sdk, anthropic, or mock |
| E003 | Config | Invalid model name | Check model ID format |
| E004 | Config | Invalid timeout value | Use positive integer |
| E005 | Config | Invalid max_iterations | Use positive integer |
| E101 | Network | API connection failed | Check network and API status |
| E102 | Network | Rate limit exceeded | Wait and retry, or reduce request rate |
| E103 | Network | Authentication failed | Check API key is valid |
| E104 | Network | Request timeout | Increase timeout or simplify request |
| E105 | Network | API returned error | Check API status page |
| E201 | Validation | L0 failed - placeholders found | Remove placeholder patterns |
| E202 | Validation | L1 failed - syntax error | Fix syntax errors in file |
| E203 | Validation | L2 failed - engine rejected | Check engine-specific requirements |
| E204 | Validation | L3 failed - physics warning | Review physics parameters |
| E301 | Resource | File not found | Check file path exists |
| E302 | Resource | Permission denied | Check file permissions |
| E303 | Resource | Path outside workspace | Use paths within workspace |
| E304 | Resource | Engine binary not found | Set LAMMPS_BINARY or QE_BINARY |
| E401 | Internal | Unexpected error | Report bug with error details |
| E402 | Internal | Parser failed | Check file format |
| E403 | Internal | Tool handler failed | Check tool implementation |

---

## F. Prompt Templates Reference

### F.1 FileAnalyzer System Prompt

```
You are an expert scientific simulation file analyzer. Your task is to examine
simulation input files and extract structured information about their contents.

You specialize in:
- LAMMPS molecular dynamics simulation files
- Quantum ESPRESSO density functional theory files
- Associated data files, force fields, and documentation

When analyzing files:
1. Identify the file type and purpose
2. Extract key parameters (atom counts, box dimensions, force field info)
3. Note any missing or incomplete information
4. Provide confidence level in your analysis

Always respond with valid JSON matching the requested schema.
```

### F.2 CampaignPlanner System Prompt

```
You are an expert computational scientist who generates simulation input files.
Your task is to create valid, runnable simulation inputs based on user intent
and available file information.

CRITICAL RULES:
1. NEVER invent force field parameters - only use what's in the FileGuides
2. ALWAYS validate your output using the validation tools
3. Document ALL assumptions you make
4. If information is missing, either use safe defaults or leave placeholders

When generating files:
1. Read the user's intent carefully
2. Extract parameters from the provided FileGuides
3. Generate the input file using write_file tool
4. Validate using validate_full tool
5. If validation fails, fix and re-validate (up to 3 times)
6. Document any assumptions or warnings

Your output should be production-ready simulation inputs.
```

### F.3 FileGuide JSON Schema

```json
{
  "type": "object",
  "properties": {
    "file_type": {
      "type": "string",
      "enum": ["lammps_data", "lammps_input", "qe_input", "excel", "pdf", "csv", "unknown"]
    },
    "purpose": {
      "type": "string",
      "description": "What this file is for (1-2 sentences)"
    },
    "atom_count": {
      "type": "integer",
      "description": "Number of atoms if applicable"
    },
    "atom_types_count": {
      "type": "integer",
      "description": "Number of atom types if applicable"
    },
    "box_dimensions": {
      "type": "object",
      "properties": {
        "x": {"type": "number"},
        "y": {"type": "number"},
        "z": {"type": "number"}
      }
    },
    "pair_style": {
      "type": "string",
      "description": "Force field style if found"
    },
    "pair_coeffs": {
      "type": "array",
      "items": {"type": "object"},
      "description": "Force field parameters if found"
    },
    "missing_info": {
      "type": "array",
      "items": {"type": "string"},
      "description": "List of missing information"
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    }
  },
  "required": ["file_type", "purpose", "confidence"]
}
```

---

## G. Dependency Versions

### G.1 Required Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| claude-agent-sdk | >=0.1.18 | Claude SDK adapter |
| anthropic | >=0.75.0 | Raw Anthropic adapter |
| python-dotenv | >=1.0.0 | Environment configuration |
| pydantic | >=2.0.0 | Data validation |
| aiohttp | >=3.9.0 | Async HTTP client |

### G.2 Optional Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| PyPDF2 | >=3.0.0 | PDF reading |
| openpyxl | >=3.1.0 | Excel reading |
| pandas | >=2.0.0 | Data analysis |

### G.3 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| pytest | >=8.0.0 | Testing |
| pytest-cov | >=4.0.0 | Coverage |
| pytest-asyncio | >=0.23.0 | Async testing |

---

## H. Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Campaign Builder CLI                            │
│                    (campaign-builder analyze/generate/validate)          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Agents Layer                                │
│  ┌─────────────────────────┐    ┌─────────────────────────────────┐    │
│  │     FileAnalyzer        │    │       CampaignPlanner           │    │
│  │  - Analyzes files       │    │  - Generates input files        │    │
│  │  - Produces FileGuides  │    │  - Validates output             │    │
│  │  - LLM or deterministic │    │  - Documents assumptions        │    │
│  └─────────────────────────┘    └─────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Interface Layer                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   AgentProvider  │  │   AgentResult    │  │    ToolDefinition    │  │
│  │   (Abstract)     │  │   (Dataclass)    │  │    (Dataclass)       │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
│                                     │                                    │
│                          ┌──────────┴──────────┐                        │
│                          │    ToolRegistry     │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Provider Adapters                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ ClaudeSDKAdapter │  │ AnthropicAdapter │  │    MockAdapter       │  │
│  │ - Built-in tools │  │ - Manual loop    │  │ - No API calls       │  │
│  │ - MCP support    │  │ - Custom tools   │  │ - Testing            │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
           ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
           │  Claude SDK   │ │ Anthropic API │ │ Mock Responses│
           │  (CLI-based)  │ │ (Direct HTTP) │ │ (In-memory)   │
           └───────────────┘ └───────────────┘ └───────────────┘
```

---

## I. Migration from v0.1.0

### I.1 What Changes

| Component | v0.1.0 | v0.3.0 |
|-----------|--------|--------|
| FileAnalyzer | Deterministic regex | LLM-powered with fallback |
| CampaignPlanner | Template-based | LLM-powered with fallback |
| Tool calls | Direct function calls | ToolDefinition registry |
| Configuration | Hardcoded | Environment-based |
| Testing | Unit tests only | Unit + Integration tests |

### I.2 Migration Steps

1. **Update dependencies**
   ```bash
   pip install claude-agent-sdk>=0.1.18
   ```

2. **Create .env file**
   - Copy template from Section C.1
   - Set ANTHROPIC_API_KEY
   - Configure provider preference

3. **No code changes needed for existing usage**
   - CLI commands remain the same
   - Default behavior uses LLM when available
   - Falls back to v0.1.0 deterministic behavior if API unavailable

4. **Run tests to verify**
   ```bash
   pytest tests/ -v
   ```

### I.3 Backward Compatibility

All v0.1.0 functionality is preserved:
- CLI commands work identically
- Existing tests continue to pass
- Files generated are compatible
- Validation pipeline unchanged

---

## J. Troubleshooting Guide

### J.1 Common Issues

**Issue: "ANTHROPIC_API_KEY not set"**
- Solution: Set the API key in .env file or environment
- Verify: `echo $ANTHROPIC_API_KEY`

**Issue: "claude-agent-sdk not found"**
- Solution: `pip install claude-agent-sdk>=0.1.18`
- Verify: `python -c "import claude_sdk"`

**Issue: "CLINotFoundError: Claude CLI not found"**
- Solution: Claude CLI may not be installed with SDK
- Workaround: Use `AGENT_PROVIDER=anthropic` instead

**Issue: "Rate limit exceeded"**
- Solution: Wait 60 seconds and retry
- Prevention: Reduce concurrent requests

**Issue: "L2 validation skipped - engine not available"**
- Solution: Set LAMMPS_BINARY or QE_BINARY in .env
- Note: This is normal if you don't have engines installed

**Issue: "Tool execution timeout"**
- Solution: Increase AGENT_TIMEOUT in .env
- Check: Tool handler may have infinite loop

### J.2 Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=DEBUG campaign-builder analyze .
```

Check provider connectivity:
```bash
python -c "
from campaign_builder.agent.factory import get_provider
provider = get_provider()
print(f'Provider: {provider.get_provider_name()}')
print(f'Available: {provider.is_available()}')
"
```

### J.3 Getting Help

1. Check error code reference (Section E)
2. Enable debug mode for more details
3. Run tests to verify installation
4. Check GitHub issues for known problems

---

## K. Version History

### K.1 v0.3.0 (Current)

**New Features:**
- Agent Abstraction Layer with provider-agnostic interface
- Three adapter implementations (Claude SDK, Anthropic Raw, Mock)
- LLM-powered FileAnalyzer with semantic understanding
- LLM-powered CampaignPlanner with self-validation
- Comprehensive tool registry system
- End-to-end integration testing
- Reliability hardening with retries and fallbacks

**Breaking Changes:**
- None (fully backward compatible)

**Dependencies Added:**
- claude-agent-sdk>=0.1.18

### K.2 v0.1.0 (Previous)

**Features:**
- Deterministic file analysis
- Template-based campaign generation
- L0-L3 validation pipeline
- CLI interface
- 354 passing tests

---

## L. Final Checklist

Before considering v0.3.0 implementation complete:

### L.1 Code Complete
- [ ] All 13 thrusts implemented
- [ ] All files from Section A created
- [ ] All tests from Section B passing

### L.2 Testing Complete
- [ ] Unit tests pass (pytest tests/)
- [ ] Integration tests pass (pytest tests/test_integration.py)
- [ ] Reliability tests pass (pytest tests/test_reliability.py)
- [ ] Coverage at 80%+

### L.3 Documentation Complete
- [ ] All thrust documents written
- [ ] .env template documented
- [ ] Error codes documented
- [ ] Troubleshooting guide complete

### L.4 Quality Assurance
- [ ] All adapters work with real API
- [ ] Fallback behavior verified
- [ ] Error messages are clear
- [ ] Logging provides debugging info

### L.5 Release Ready
- [ ] Version bumped to 0.3.0
- [ ] CHANGELOG updated
- [ ] README updated with new features
- [ ] Dependencies in pyproject.toml correct

---

*End of DevGuide v0.3.0 Appendices*
