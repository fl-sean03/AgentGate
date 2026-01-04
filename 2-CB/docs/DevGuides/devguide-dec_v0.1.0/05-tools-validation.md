# Validation Tools

This file contains Thrusts 6-8: L0-L3 validation pipeline implementation.

---

## System Execution Paths

**CRITICAL:** These are the actual binary paths on this WSL2 system:

**LAMMPS:**
- Binary: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp`
- CPU execution: `lmp -in input.lmp`
- GPU execution: `lmp -sf gpu -pk gpu 1 neigh yes -in input.lmp`

**Quantum ESPRESSO:**
- CPU binary: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x`
- GPU binary: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x`
- CPU execution: `pw.x < input.in > output.out`
- GPU execution: Requires sourcing NVHPC environment first

**Environment variables for Campaign Builder:**
```bash
LAMMPS_PATH="/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp"
QE_PATH="/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x"
```

---

## Thrust 6: L0 Validation - Template Completeness

### 6.1 Objective

Implement L0 validation that detects any placeholder patterns in generated files, ensuring no incomplete generation.

### 6.2 Background

L0 is the first validation gate. It catches incomplete generation where:
- Template variables weren't filled
- TODO markers remain
- Any placeholder text exists

If L0 fails, the deck definitely won't run. This is a BLOCKING validation level.

### 6.3 Subtasks

#### 6.3.1 Define Placeholder Patterns

In `campaign_builder/tools/validation.py`, define regex patterns for all placeholder types:

**Pattern categories:**

| Category | Patterns | Examples |
|----------|----------|----------|
| Handlebars | `\{\{[^}]+\}\}` | {{temperature}}, {{epsilon}} |
| Shell variables | `\$\{[^}]+\}` | ${TEMP}, ${CUTOFF} |
| Angle brackets | `<[A-Z_]+>` | <INSERT_VALUE>, <TODO> |
| Explicit markers | `\[PLACEHOLDER\]`, `\[FILL[^\]]*\]` | [PLACEHOLDER], [FILL_IN] |
| TODO markers | `TODO:?`, `FIXME:?`, `XXX` | TODO:, FIXME, XXX |
| Question marks | `\?\?\?+` | ??? |
| Underscore fills | `_{5,}` | _____ (5+ underscores) |
| TBD markers | `\bTBD\b`, `N/A \(replace\)` | TBD |

**Compile patterns:**
- Compile all patterns once at module load
- Use case-insensitive matching for markers
- Case-sensitive for template patterns

#### 6.3.2 Create L0ValidationResult Dataclass

```python
@dataclass
class L0ValidationResult:
    passed: bool
    placeholders_found: List[PlaceholderMatch]
    total_placeholders: int
    lines_checked: int
```

**PlaceholderMatch:**
```python
@dataclass
class PlaceholderMatch:
    pattern_type: str  # "handlebars", "shell_var", etc.
    matched_text: str  # The actual matched string
    line_number: int   # 1-indexed line number
    column: int        # Character position in line
    context: str       # Surrounding text (truncated)
```

#### 6.3.3 Implement validate_l0 Function

```python
def validate_l0(content: str) -> L0ValidationResult
```

**Algorithm:**
1. Split content into lines
2. For each line:
   a. For each pattern:
      - Find all matches
      - Record line number, column, context
3. Compile results
4. Return L0ValidationResult with passed=(total_placeholders == 0)

**Context extraction:**
- Include 20 chars before and after match
- Truncate with "..." if longer
- Handle line boundaries

#### 6.3.4 Implement validate_l0_file Function

```python
def validate_l0_file(file_path: Union[str, Path]) -> L0ValidationResult
```

**Steps:**
1. Read file content
2. Call validate_l0(content)
3. Return result

**Error handling:**
- File not found → return failed result with error
- Read error → return failed result with error

#### 6.3.5 Add Helper Methods

**format_l0_report:**
```python
def format_l0_report(result: L0ValidationResult) -> str
```

Format result as human-readable report:
```
L0 Validation: PASSED/FAILED
Placeholders found: N

Line 5: {{temperature}} (handlebars)
  Context: "...fix nvt all temp {{temperature}} {{temperature}} 100.0..."

Line 12: TODO: (marker)
  Context: "...pair_coeff TODO: add coefficients..."
```

### 6.4 Verification Steps

1. **Pattern detection works:**
   - [ ] Detects `{{variable}}`
   - [ ] Detects `${VAR}`
   - [ ] Detects `<PLACEHOLDER>`
   - [ ] Detects `TODO:` and `FIXME`
   - [ ] Detects `???`
   - [ ] Detects `_____`

2. **Clean files pass:**
   - [ ] File with no placeholders → passed=True
   - [ ] total_placeholders=0

3. **Position tracking works:**
   - [ ] Line numbers are 1-indexed
   - [ ] Column positions are correct
   - [ ] Context is extracted properly

4. **Report formatting works:**
   - [ ] Clear PASSED/FAILED indication
   - [ ] All placeholders listed
   - [ ] Context shown for each

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/tools/validation.py` | Modified | Add L0 validation |
| `tests/test_tools.py` | Modified | Add L0 tests |

---

## Thrust 7: L1 Validation - Syntax Validation

### 7.1 Objective

Implement engine-specific syntax validation for LAMMPS and Quantum ESPRESSO input files.

### 7.2 Background

L1 validation catches syntax errors that any parser would find:
- Missing required commands
- Commands in wrong order
- Incomplete specifications
- Malformed syntax

This is a BLOCKING validation level - files must pass L1 before proceeding.

### 7.3 Subtasks

#### 7.3.1 Create L1ValidationResult Dataclass

```python
@dataclass
class L1ValidationResult:
    passed: bool
    engine: str  # "lammps" or "qe"
    errors: List[ValidationIssue]
    warnings: List[ValidationIssue]
    checks_run: int
    checks_passed: int
```

**ValidationIssue:**
```python
@dataclass
class ValidationIssue:
    code: str           # Issue code like "L1_MISSING_UNITS"
    message: str        # Human-readable description
    severity: str       # "error" or "warning"
    line_number: Optional[int]
    suggestion: Optional[str]
```

#### 7.3.2 Implement LAMMPS L1 Validation

```python
def validate_l1_lammps(content: str) -> L1ValidationResult
```

**Required commands (ERRORS if missing):**

| Command | Check | Error Code |
|---------|-------|------------|
| units | Must be present, first non-comment command | L1_MISSING_UNITS |
| atom_style | Must be present | L1_MISSING_ATOM_STYLE |
| boundary | Must be present | L1_MISSING_BOUNDARY |

**Command order (ERRORS if wrong):**

| Rule | Check | Error Code |
|------|-------|------------|
| pair_style before pair_coeff | pair_style line < pair_coeff lines | L1_PAIR_ORDER |
| read_data before usage | read_data before fixes/computes using atoms | L1_READ_DATA_ORDER |
| variable before use | variable defined before ${var} usage | L1_VAR_ORDER |

**Completeness (ERRORS):**

| Rule | Check | Error Code |
|------|-------|------------|
| All pairs covered | For N types, need pair_coeffs for all pairs or mixing rule | L1_INCOMPLETE_PAIRS |
| Bond coeffs if bonds | bond_style and bond_coeff if bonds in data | L1_MISSING_BOND_COEFFS |

**Syntax checks (ERRORS):**

| Check | Description | Error Code |
|-------|-------------|------------|
| Fix arguments | Fixes have minimum required args | L1_FIX_ARGS |
| Compute syntax | Compute commands properly formed | L1_COMPUTE_SYNTAX |
| Dump format | Dump commands valid | L1_DUMP_SYNTAX |

**Reasonableness (WARNINGS):**

| Check | Description | Warning Code |
|-------|-------------|--------------|
| Timestep positive | timestep > 0 | L1_TIMESTEP_ZERO |
| Run present | At least one run command | L1_NO_RUN |
| File paths | read_data file path looks valid | L1_FILE_PATH |

#### 7.3.3 Implement LAMMPS Command Parser

Create helper to parse LAMMPS commands:

```python
def parse_lammps_commands(content: str) -> List[LAMMPSCommand]
```

**LAMMPSCommand:**
```python
@dataclass
class LAMMPSCommand:
    name: str           # Command name
    args: List[str]     # Arguments
    line_number: int    # Line number
    raw_line: str       # Original line
```

**Parsing rules:**
- Skip blank lines
- Skip comment lines (start with #)
- Handle inline comments (strip # and after)
- Handle line continuations (&)
- Split on whitespace

#### 7.3.4 Implement QE L1 Validation

```python
def validate_l1_qe(content: str) -> L1ValidationResult
```

**Required namelists (ERRORS):**

| Namelist | Error Code |
|----------|------------|
| &CONTROL | L1_MISSING_CONTROL |
| &SYSTEM | L1_MISSING_SYSTEM |
| &ELECTRONS | L1_MISSING_ELECTRONS |

**Namelist syntax (ERRORS):**

| Check | Description | Error Code |
|-------|-------------|------------|
| Matching delimiters | Every `&` has matching `/` | L1_NAMELIST_UNCLOSED |
| No duplicates | No duplicate parameter names | L1_DUPLICATE_PARAM |
| Valid format | parameter = value syntax | L1_PARAM_SYNTAX |

**Required cards (ERRORS):**

| Card | Error Code |
|------|------------|
| ATOMIC_SPECIES | L1_MISSING_SPECIES |
| ATOMIC_POSITIONS | L1_MISSING_POSITIONS |
| K_POINTS | L1_MISSING_KPOINTS |

**Consistency (ERRORS):**

| Check | Description | Error Code |
|-------|-------------|------------|
| nat matches positions | nat value = ATOMIC_POSITIONS count | L1_NAT_MISMATCH |
| ntyp matches species | ntyp value = ATOMIC_SPECIES count | L1_NTYP_MISMATCH |
| Species consistency | All position species in ATOMIC_SPECIES | L1_SPECIES_MISMATCH |

**Completeness (ERRORS):**

| Check | Description | Error Code |
|-------|-------------|------------|
| ecutwfc defined | Wavefunction cutoff present | L1_MISSING_ECUTWFC |
| Cell defined | ibrav+celldm OR CELL_PARAMETERS | L1_MISSING_CELL |

**Reasonableness (WARNINGS):**

| Check | Description | Warning Code |
|-------|-------------|--------------|
| ecutwfc range | 10-200 Ry typical | L1_ECUTWFC_UNUSUAL |
| PP files specified | Pseudopotential files in ATOMIC_SPECIES | L1_MISSING_PP |

#### 7.3.5 Implement QE Namelist Parser

```python
def parse_qe_namelists(content: str) -> Dict[str, Dict[str, str]]
```

Returns dict like:
```python
{
    "CONTROL": {"calculation": "scf", "prefix": "pwscf", ...},
    "SYSTEM": {"nat": "2", "ntyp": "1", ...},
    "ELECTRONS": {"conv_thr": "1.0d-6", ...}
}
```

**Parsing rules:**
- Namelist starts with `&NAME`
- Namelist ends with `/`
- Parameters: `name = value` or `name = 'string'`
- Handle multi-line values
- Case-insensitive namelist names

#### 7.3.6 Implement QE Card Parser

```python
def parse_qe_cards(content: str) -> Dict[str, List[str]]
```

Returns dict like:
```python
{
    "ATOMIC_SPECIES": ["Si 28.0855 Si.pbe-n-kjpaw.UPF"],
    "ATOMIC_POSITIONS": ["Si 0.0 0.0 0.0", "Si 0.25 0.25 0.25"],
    "K_POINTS": ["automatic", "4 4 4 1 1 1"]
}
```

**Card detection:**
- Card names in ALL CAPS
- Card may have options: `ATOMIC_POSITIONS (crystal)`
- Content follows until next card or EOF

#### 7.3.7 Create Unified validate_l1 Function

```python
def validate_l1(
    content: str,
    engine: str  # "lammps" or "qe"
) -> L1ValidationResult
```

Dispatches to appropriate validator based on engine.

### 7.4 Verification Steps

1. **LAMMPS validation:**
   - [ ] Missing units detected
   - [ ] Missing atom_style detected
   - [ ] pair_style/pair_coeff order checked
   - [ ] Incomplete pair_coeffs detected

2. **QE validation:**
   - [ ] Missing namelists detected
   - [ ] nat/ntyp consistency checked
   - [ ] Missing ecutwfc detected
   - [ ] Species consistency checked

3. **Parser accuracy:**
   - [ ] LAMMPS commands parsed correctly
   - [ ] QE namelists extracted correctly
   - [ ] QE cards extracted correctly

4. **Error reporting:**
   - [ ] Clear error messages
   - [ ] Line numbers provided
   - [ ] Suggestions included

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/tools/validation.py` | Modified | Add L1 validation |
| `tests/test_tools.py` | Modified | Add L1 tests |
| `tests/fixtures/valid_lammps.in` | Created | Valid LAMMPS input |
| `tests/fixtures/invalid_lammps.in` | Created | Invalid LAMMPS for testing |
| `tests/fixtures/valid_qe.pwi` | Created | Valid QE input |
| `tests/fixtures/invalid_qe.pwi` | Created | Invalid QE for testing |

---

## Thrust 8: L2-L3 Validation

### 8.1 Objective

Implement L2 (engine acceptance) and L3 (physical reasonableness) validation.

### 8.2 Background

**L2:** Actually runs the simulation engine to verify it accepts the input. This catches issues only the real engine would find. BLOCKING if engine is available.

**L3:** Checks physical reasonableness of settings. This catches issues that would run but produce garbage. NON-BLOCKING (warnings only).

### 8.3 Subtasks

#### 8.3.1 Create L2/L3 Result Dataclasses

```python
@dataclass
class L2ValidationResult:
    passed: bool
    engine: str
    engine_available: bool
    engine_output: Optional[str]
    errors: List[ValidationIssue]
    execution_time_ms: int

@dataclass
class L3ValidationResult:
    passed: bool  # Always True (advisory only)
    engine: str
    warnings: List[ValidationIssue]
    info: List[ValidationIssue]
    checks_run: int
```

#### 8.3.2 Implement Engine Discovery

```python
def find_lammps_binary() -> Optional[Path]
def find_qe_binary() -> Optional[Path]
```

**Search order for LAMMPS:**
1. Environment variable: `LAMMPS_PATH`
2. Hardcoded system path: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp`
3. System PATH: `which lmp` or `which lammps`

**Search order for QE:**
1. Environment variable: `QE_PATH`
2. Hardcoded system path: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x`
3. System PATH: `which pw.x`

**Validation:**
- Check file exists
- Check file is executable
- Return None if not found

#### 8.3.3 Implement LAMMPS L2 Validation

```python
def validate_l2_lammps(
    file_path: Union[str, Path],
    structure_file: Optional[Path] = None,
    timeout: int = 30
) -> L2ValidationResult
```

**Execution strategy:**

1. Find LAMMPS binary
2. If not found → return engine_available=False, passed=True (skip)
3. Create temporary directory for execution
4. Copy input file (and structure if provided)
5. Modify input to run 0 steps (if needed)
6. Execute LAMMPS with timeout:
   ```bash
   lmp -in input.lmp 2>&1
   ```
7. Capture stdout/stderr
8. Parse output for errors
9. Clean up temporary files
10. Return result

**LAMMPS execution options:**
- Use `-log none` to suppress log file
- Use `-screen none` if non-interactive
- Set very short run (0 steps) to just parse

**Error detection:**
- Look for "ERROR:" in output
- Look for "LAMMPS" error patterns
- Non-zero exit code = error

#### 8.3.4 Implement QE L2 Validation

```python
def validate_l2_qe(
    file_path: Union[str, Path],
    timeout: int = 60
) -> L2ValidationResult
```

**Execution strategy:**

1. Find pw.x binary
2. If not found → return engine_available=False, passed=True (skip)
3. Create temporary directory
4. Copy input file
5. Execute QE:
   ```bash
   pw.x < input.pwi 2>&1
   ```
6. Allow to run briefly, then kill (just test parsing)
7. Capture output
8. Parse for errors
9. Clean up
10. Return result

**QE error detection:**
- Look for "Error in routine"
- Look for "stopping..."
- Check exit code

**QE early termination:**
- QE doesn't have a parse-only mode
- Run with 1 SCF step max or terminate after parsing
- Set `electron_maxstep = 1` in test mode

#### 8.3.5 Implement L3 Physical Checks

```python
def validate_l3(
    content: str,
    engine: str,
    box_dimensions: Optional[BoxDimensions] = None
) -> L3ValidationResult
```

**Universal L3 checks:**

| Check | Description | Threshold | Severity |
|-------|-------------|-----------|----------|
| Temperature range | 0 < T < 10000 K | Outside range | Warning |
| Pressure range | Reasonable for system | Extreme values | Info |
| Cutoff vs box | cutoff < min(box)/2 | Violated | Error |

**LAMMPS L3 checks:**

| Check | Description | Severity |
|-------|-------------|----------|
| Timestep | Appropriate for units (1-2 fs for real) | Warning |
| Thermostat damping | 100*timestep typical | Info |
| Barostat coupling | Similar to thermostat | Info |
| Neighbor skin | 2.0 typical for real units | Info |
| Output frequency | Not too sparse/frequent | Info |
| Run length | Reasonable for purpose | Info |

**QE L3 checks:**

| Check | Description | Severity |
|-------|-------------|----------|
| ecutrho ratio | 4x for NC, 8-12x for US/PAW | Warning |
| K-point density | Sufficient for system type | Warning |
| conv_thr | Appropriate for calculation | Info |
| mixing_beta | 0.1-0.7 typical | Info |
| smearing width | Appropriate for metal/insulator | Info |

#### 8.3.6 Implement Property-Specific L3 Checks

**For diffusion calculations:**

| Check | Description |
|-------|-------------|
| MSD compute | compute msd defined |
| Correct ensemble | NVE or NVT (not NPT during measurement) |
| Run length | Long enough for diffusive regime (ns scale) |
| Output frequency | Appropriate for MSD analysis |

**For equilibration:**

| Check | Description |
|-------|-------------|
| Temperature control | fix nvt or fix temp present |
| Duration | Sufficient for system size |
| Monitoring | thermo output enabled |

**For production:**

| Check | Description |
|-------|-------------|
| Data collection | Appropriate dumps/computes |
| Trajectory output | If needed for analysis |
| Checkpointing | restart files for long runs |

#### 8.3.7 Create Unified validate_deck Function

```python
def validate_deck(
    file_path: Union[str, Path],
    engine: str,
    levels: Optional[List[str]] = None,  # ["L0", "L1", "L2", "L3"]
    structure_file: Optional[Path] = None,
    box_dimensions: Optional[BoxDimensions] = None
) -> ValidationResult
```

**ValidationResult:**
```python
@dataclass
class ValidationResult:
    overall_passed: bool
    l0: Optional[L0ValidationResult]
    l1: Optional[L1ValidationResult]
    l2: Optional[L2ValidationResult]
    l3: Optional[L3ValidationResult]
    all_issues: List[ValidationIssue]
    can_run: bool  # L0+L1 passed minimum
    suggestions: List[str]
```

**Execution flow:**
1. Default levels = ["L0", "L1", "L2", "L3"]
2. Read file content
3. Run L0 if in levels → if fails and blocking, stop
4. Run L1 if in levels → if fails, stop
5. Run L2 if in levels → if engine unavailable, warn and continue
6. Run L3 if in levels → always completes (warnings only)
7. Compile all results

#### 8.3.8 Implement Repair Suggestion Generator

```python
def suggest_repairs(issues: List[ValidationIssue]) -> List[str]
```

For each issue type, provide specific repair suggestions:

| Issue | Suggestion |
|-------|------------|
| L1_MISSING_UNITS | "Add 'units real' at the start of the file" |
| L1_PAIR_ORDER | "Move pair_style command before pair_coeff commands" |
| L1_NAT_MISMATCH | "Update nat in &SYSTEM to match ATOMIC_POSITIONS count" |
| L3_CUTOFF_BOX | "Reduce pair_style cutoff or increase box dimensions" |

#### 8.3.9 Update Exports

Update `campaign_builder/tools/__init__.py`:
- validate_l0
- validate_l1
- validate_l2_lammps
- validate_l2_qe
- validate_l3
- validate_deck
- L0ValidationResult, L1ValidationResult, L2ValidationResult, L3ValidationResult
- ValidationResult, ValidationIssue

### 8.4 Verification Steps

1. **L2 LAMMPS works:**
   - [ ] Finds LAMMPS binary at system path
   - [ ] Executes test file
   - [ ] Captures errors correctly
   - [ ] Handles timeout
   - [ ] Cleans up temp files

2. **L2 QE works:**
   - [ ] Finds pw.x binary at system path
   - [ ] Executes test file
   - [ ] Captures errors correctly
   - [ ] Handles timeout

3. **L2 graceful degradation:**
   - [ ] Missing engine → engine_available=False
   - [ ] Returns passed=True when engine unavailable
   - [ ] Clear warning about skipped L2

4. **L3 checks work:**
   - [ ] Temperature range checked
   - [ ] Cutoff vs box checked
   - [ ] Engine-specific checks run
   - [ ] Property-specific checks work

5. **Unified validate_deck:**
   - [ ] Runs all levels
   - [ ] Stops appropriately on failures
   - [ ] Compiles complete result
   - [ ] Generates repair suggestions

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/tools/validation.py` | Modified | Add L2, L3, validate_deck |
| `campaign_builder/tools/__init__.py` | Modified | Export all validation |
| `tests/test_tools.py` | Modified | Add L2, L3 tests |

---

## Implementation Notes

### Timeout Handling

Use subprocess with timeout:
```python
result = subprocess.run(
    cmd,
    capture_output=True,
    timeout=timeout,
    text=True
)
```

Handle TimeoutExpired exception gracefully.

### Temporary File Management

Use tempfile module:
```python
with tempfile.TemporaryDirectory() as tmpdir:
    # Copy files, execute, capture output
    pass  # Auto-cleanup on exit
```

### Engine Binary Verification

Before execution, verify binary:
```python
def verify_binary(path: Path) -> bool:
    return path.exists() and os.access(path, os.X_OK)
```

### Error Message Parsing

Create regex patterns for common error formats:
- LAMMPS: `ERROR: (.+) \(src/(.+):(\d+)\)`
- QE: `Error in routine (.+) \((\d+)\):`

### Security Considerations

- Never execute user-provided commands directly
- Validate all file paths
- Use sandbox/temp directories
- Set resource limits on subprocesses

### Next Thrust

After completing Thrusts 6-8, proceed to [06-prompts.md](./06-prompts.md) for agent prompt implementation.
