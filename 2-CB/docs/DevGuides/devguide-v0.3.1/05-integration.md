# DevGuide v0.3.1: Integration Testing

**Thrusts 7-8: Integration Test Fixtures and CLI Verification**

---

## Thrust 7: Integration Test Fixtures

### 7.1 Objective

Create realistic test workspaces with complete simulation file sets for end-to-end testing.

### 7.2 Background

The v0.3.0 spec called for integration fixtures but only `water.data` exists. Complete fixtures enable:
- Full pipeline testing (analyze → generate → validate)
- Multi-file workspace scenarios
- Real-world file format coverage

### 7.3 Subtasks

#### 7.3.1 Create polymer example

Create `tests/fixtures/integration/polymer_example/` containing:

**polymer.data** - LAMMPS data file with:
- ~500 atoms representing a polymer chain
- Multiple atom types (C, H, O)
- Bonded interactions defined
- Proper box dimensions

**force_field.xlsx** - Excel file with:
- Pair coefficients (epsilon, sigma)
- Bond coefficients
- Angle coefficients
- Dihedral coefficients

**README.md** - Documentation with:
- System description
- Suggested simulation parameters
- Expected behavior

#### 7.3.2 Create silicon example

Create `tests/fixtures/integration/silicon_example/` containing:

**silicon.cif** - CIF structure file with:
- Diamond cubic silicon
- 8 atoms in unit cell
- Proper space group

**si_scf.in** - Quantum ESPRESSO input with:
- SCF calculation setup
- K-points specification
- Pseudopotential reference

**pseudopotential_info.txt** - Text file with:
- Pseudopotential recommendations
- Cutoff energy suggestions
- Notes on convergence

#### 7.3.3 Create incomplete example

Create `tests/fixtures/integration/incomplete_example/` with:

**partial.data** - LAMMPS data file missing:
- Force field parameters
- Some atom type definitions

This tests error handling and missing information detection.

#### 7.3.4 Add fixture conftest

Update `tests/conftest.py` with fixtures:

**polymer_workspace** - Returns Path to polymer example
**silicon_workspace** - Returns Path to silicon example
**incomplete_workspace** - Returns Path to incomplete example

### 7.4 Verification Steps

1. Verify fixtures exist:
   ```bash
   ls -la tests/fixtures/integration/
   ls -la tests/fixtures/integration/polymer_example/
   ls -la tests/fixtures/integration/silicon_example/
   ```
   Expected: All directories and files present

2. Verify LAMMPS data file is valid:
   ```python
   from campaign_builder.tools.validation import validate_l1_lammps
   from pathlib import Path

   result = validate_l1_lammps(Path("tests/fixtures/integration/polymer_example/polymer.data"))
   print(f"Valid: {result.valid}")
   ```
   Expected: Valid or known issues documented

3. Verify QE file is valid:
   ```python
   from campaign_builder.tools.validation import validate_l1_qe
   from pathlib import Path

   result = validate_l1_qe(Path("tests/fixtures/integration/silicon_example/si_scf.in"))
   print(f"Valid: {result.valid}")
   ```
   Expected: Valid

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/fixtures/integration/polymer_example/` | Created | Polymer test files |
| `tests/fixtures/integration/silicon_example/` | Created | Silicon DFT test files |
| `tests/fixtures/integration/incomplete_example/` | Created | Error case test files |
| `tests/conftest.py` | Modified | Add workspace fixtures |

---

## Thrust 8: CLI Command Integration Tests

### 8.1 Objective

Create tests verifying the Campaign Builder CLI commands work end-to-end.

### 8.2 Background

CLI commands to test:
- `campaign-builder analyze <workspace>` - Analyze files
- `campaign-builder generate <workspace> "<intent>"` - Generate campaigns
- `campaign-builder validate <file>` - Validate files

### 8.3 Subtasks

#### 8.3.1 Create CLI test file

Create `tests/test_cli_integration.py` with:
- Subprocess invocation of CLI
- Output parsing
- Exit code verification

#### 8.3.2 Test analyze command

Test cases:

**test_analyze_polymer_workspace**
- Run: `campaign-builder analyze tests/fixtures/integration/polymer_example/`
- Verify: Exit code 0
- Verify: Output contains file analysis results
- Verify: Multiple files analyzed

**test_analyze_with_json**
- Run: `campaign-builder analyze <workspace> --json`
- Verify: Output is valid JSON
- Verify: Contains FileGuide structures

**test_analyze_nonexistent**
- Run: `campaign-builder analyze /nonexistent/path`
- Verify: Non-zero exit code
- Verify: Error message in output

#### 8.3.3 Test generate command

Test cases:

**test_generate_nvt_simulation**
- Run: `campaign-builder generate <polymer> "NVT at 300K for 1ns"`
- Verify: Exit code 0
- Verify: Output file created
- Verify: File contains expected LAMMPS commands

**test_generate_with_missing_info**
- Run: `campaign-builder generate <incomplete> "Run MD"`
- Verify: Warnings about missing information
- Verify: Assumptions documented

#### 8.3.4 Test validate command

Test cases:

**test_validate_generated_file**
- First generate a file
- Run: `campaign-builder validate <generated_file>`
- Verify: L0-L3 results shown
- Verify: Exit code reflects validation status

**test_validate_with_placeholders**
- Create file with placeholders
- Run validate
- Verify: L0 failure detected

### 8.4 Verification Steps

1. Run CLI tests:
   ```bash
   pytest tests/test_cli_integration.py -v
   ```
   Expected: All CLI tests pass

2. Test manually:
   ```bash
   campaign-builder analyze tests/fixtures/integration/polymer_example/
   campaign-builder validate tests/fixtures/lammps/water.data
   ```
   Expected: Commands run without error

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/test_cli_integration.py` | Created | CLI integration tests |

---

## Phase 4 Completion Checklist

Before moving to Phase 5, verify:

- [ ] Polymer example fixture created with 3+ files
- [ ] Silicon example fixture created with 3+ files
- [ ] Incomplete example fixture created
- [ ] Workspace fixtures in conftest.py
- [ ] CLI analyze tests pass
- [ ] CLI generate tests pass
- [ ] CLI validate tests pass

---

## Next Document

Continue to [06-polish.md](./06-polish.md) for Thrusts 9-10: Production polish.
