# DevGuide v0.3.1: Validation Integration

**Thrusts 3-4: Agent Tool Validation Wrappers and E2E Pipeline**

---

## Thrust 3: Agent Tool Validation Wrappers

### 3.1 Objective

Wire the agent tool wrappers in `campaign_builder/agent/tools/validation.py` to the actual L0-L3 validators in `campaign_builder/tools/validation/`.

### 3.2 Background

Two validation systems exist:
1. **Core validators** in `campaign_builder/tools/validation/`:
   - `validate_l0()` - Placeholder detection
   - `validate_l1_lammps()` - LAMMPS syntax
   - `validate_l1_qe()` - QE syntax
   - `validate_l2()` - Engine execution
   - `validate_l3()` - Physics checks
   - `validate_deck()` - Full pipeline

2. **Agent tool wrappers** in `campaign_builder/agent/tools/validation.py`:
   - ToolDefinition entries registered with ToolRegistry
   - Currently may have stub implementations

The goal is to connect these so LLM agents can use validation tools.

### 3.3 Subtasks

#### 3.3.1 Review existing tool wrappers

Read `campaign_builder/agent/tools/validation.py` and identify:
- Which tools are registered
- What their current handlers do
- What parameters they accept

#### 3.3.2 Implement validate_l0 handler

Create async handler that:
- Accepts `file_path` or `content` parameter
- Calls `validate_l0()` from core validators
- Returns JSON-formatted result string
- Handles errors gracefully

#### 3.3.3 Implement validate_lammps_syntax handler

Create async handler that:
- Accepts `file_path` or `content`
- Calls `validate_l1_lammps()`
- Returns structured result with:
  - valid: bool
  - commands_found: list
  - issues: list of error messages

#### 3.3.4 Implement validate_qe_syntax handler

Create async handler that:
- Accepts `file_path` or `content`
- Calls `validate_l1_qe()`
- Returns structured result with:
  - valid: bool
  - namelists_found: list
  - cards_found: list
  - issues: list

#### 3.3.5 Implement validate_engine handler

Create async handler that:
- Accepts `file_path` and `engine` (lammps/qe)
- Calls `validate_l2()`
- Returns result with:
  - valid: bool
  - skipped: bool (if engine not available)
  - skip_reason: string (if skipped)
  - output: string (engine output if run)

#### 3.3.6 Implement check_physics handler

Create async handler that:
- Accepts `file_path` or `content` and `engine`
- Calls `validate_l3()`
- Returns result with:
  - valid: bool
  - warnings: list of physics warnings
  - checks_performed: list

#### 3.3.7 Implement validate_full handler

Create async handler that:
- Accepts `file_path` and optional `engine`
- Calls `validate_deck()` for full L0-L3 pipeline
- Returns comprehensive result with all levels

### 3.4 Verification Steps

1. Test L0 validation tool:
   ```python
   import asyncio
   from campaign_builder.agent.tools.validation import default_registry

   tool = default_registry.get("validate_l0")
   result = await tool.handler({"content": "units real\npair_style {{PAIR}}"})
   print(result)  # Should show placeholder detected
   ```

2. Test LAMMPS validation tool:
   ```python
   tool = default_registry.get("validate_lammps_syntax")
   result = await tool.handler({"content": "units real\natom_style full\nrun 1000"})
   print(result)  # Should show valid with commands found
   ```

3. Test with LLM:
   ```python
   from campaign_builder.agent.factory import get_best_available_provider
   from campaign_builder.agent.tools.validation import (
       validate_l0_tool, validate_lammps_syntax_tool
   )

   provider = get_best_available_provider()
   result = await provider.run(
       prompt="Validate this LAMMPS content for placeholders: 'units {{UNITS}}'",
       system_prompt="Use validation tools",
       tools=[validate_l0_tool]
   )
   print(result.tool_calls)  # Should show tool was used
   ```

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/tools/validation.py` | Modified | Implement handlers |

---

## Thrust 4: End-to-End Validation Pipeline Tests

### 4.1 Objective

Create comprehensive tests verifying the full validation pipeline works from agent tool invocation through to actual validation results.

### 4.2 Background

Validation tools should work both:
1. **Direct call**: Handler called with parameters
2. **LLM invocation**: LLM uses tool during conversation

Need tests for both scenarios.

### 4.3 Subtasks

#### 4.3.1 Create test file

Create `tests/test_validation_e2e.py` with proper structure.

#### 4.3.2 Test L0 validation

Test cases:
- Clean content passes
- Content with `{{PLACEHOLDER}}` fails
- Content with `__PLACEHOLDER__` fails
- Content with `TODO:` pattern fails
- Content with `FIXME` pattern fails

#### 4.3.3 Test L1 LAMMPS validation

Test cases:
- Valid LAMMPS script passes
- Missing `units` command detected
- Missing `atom_style` detected
- Invalid command detected
- Commands found list accurate

#### 4.3.4 Test L1 QE validation

Test cases:
- Valid QE input passes
- Missing &CONTROL namelist detected
- Missing nat/ntyp consistency detected
- Missing ecutwfc detected
- Namelists and cards correctly identified

#### 4.3.5 Test L2 validation

Test cases:
- Gracefully skips if engine not available
- Returns skip_reason when skipped
- Works with engine if available (marked for CI skip)

#### 4.3.6 Test L3 physics checks

Test cases:
- Normal temperature passes
- Extreme temperature (>10000K) warns
- Large timestep warns
- Low ecutwfc warns for QE

#### 4.3.7 Test full pipeline

Test cases:
- Valid file passes all levels
- L0 failure stops pipeline
- L1 failure after L0 passes
- Collects all issues across levels

### 4.4 Verification Steps

1. Run validation E2E tests:
   ```bash
   pytest tests/test_validation_e2e.py -v
   ```
   Expected: All tests pass

2. Test with real LLM:
   ```bash
   pytest tests/test_validation_e2e.py::test_llm_uses_validation -v
   ```
   Expected: LLM correctly uses validation tool

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/test_validation_e2e.py` | Created | E2E validation tests |

---

## Phase 2 Completion Checklist

Before moving to Phase 3, verify:

- [ ] All 6 validation tool handlers implemented
- [ ] Handlers call actual validators
- [ ] Handlers return JSON-formatted results
- [ ] E2E tests cover L0, L1, L2, L3
- [ ] Tests pass without API key (mock)
- [ ] Tests pass with API key (live)

---

## Next Document

Continue to [04-streaming.md](./04-streaming.md) for Thrusts 5-6: Streaming standardization.
