# Validation Pipeline

## Thrust 5: L0-L1 Validators

### 5.1 Objective
Implement placeholder detection and combined syntax + physics parameter validation.

### 5.2 Subtasks

#### 5.2.1 Implement L0 Placeholder Detection
Create `l0_placeholders.py` with:
- Function to detect placeholder patterns
- Support for `{{PLACEHOLDER}}`, `<PLACEHOLDER>`, `TODO:`, `FIXME:`
- Return list of found placeholders with line numbers
- Return L0Result with passed/failed status

#### 5.2.2 Implement L1 Syntax + Physics Validation
Create `l1_syntax.py` with:
- Function to validate LAMMPS command syntax
- Check for required commands (units, atom_style, etc.)
- Check for common syntax errors
- **Physics parameter checks:**
  - Timestep reasonableness for unit system
  - Temperature range checks (negative = failure)
- Return L1Result with syntax_errors, physics_warnings, and details

#### 5.2.3 Add Required Command Checks
Verify presence of essential commands:
- `units` - must be present
- `atom_style` - must be present
- `boundary` - recommended
- Structure command (read_data, create_box, etc.)
- `pair_style` and `pair_coeff` - for force field
- `run` or similar dynamics command

#### 5.2.4 Add Syntax Error Detection
Check for common errors:
- Unmatched quotes
- Invalid command names
- Missing required arguments
- Conflicting settings

### 5.3 Verification Steps
1. L0 detects `{{TEMP}}` placeholder
2. L0 passes on clean content
3. L1 fails on missing `units`
4. L1 warns on extreme timestep
5. L1 fails on negative temperature
6. L1 passes on valid LAMMPS deck

### 5.4 Files Modified
| File | Action |
|------|--------|
| `lammps_reaper/validation/l0_placeholders.py` | Modified |
| `lammps_reaper/validation/l1_syntax.py` | Modified |

---

## Thrust 6: L2-L3 Validators

### 6.1 Objective
Implement engine acceptance (0 steps) and minimal execution (20 steps) checks.

### 6.2 Subtasks

#### 6.2.1 Implement L2 Engine Acceptance Check
Create `l2_engine.py` with:
- Function to run LAMMPS with **zero steps**
- Write deck to temp file
- Execute `lmp -in deck.in` with `run 0`
- Parse output for errors
- Return L2Result with passed/skipped status

#### 6.2.2 Add LAMMPS Binary Detection
Implement binary detection:
- Check common paths (`/usr/bin/lmp`, etc.)
- Check environment variable `LAMMPS_BINARY`
- Check user-provided path
- Skip L2/L3 if binary not found (with warning)

#### 6.2.3 Implement L3 Minimal Execution Check
Create `l3_physics.py` with:
- Function to run LAMMPS with **minimal steps (20)**
- Tests that force field evaluations work
- Catches initial velocity blowups
- Detects neighbor list failures
- Verifies integrator stability
- Return L3Result with execution details (steps_run, engine_output)

#### 6.2.4 Add Explosion Detection
Implement detection of runtime failures:
- "Lost atoms" errors
- "Out of range" errors
- Non-zero return codes
- Timeout handling

#### 6.2.5 Create Unified Validator
Create `validation/__init__.py` with:
- `validate_deck()` function that runs all levels
- L0: Placeholder check
- L1: Syntax + physics parameter check
- L2: Engine acceptance (0 steps)
- L3: Minimal execution (20 steps)
- Aggregates results into ValidationResult
- Returns comprehensive result

### 6.3 Verification Steps
1. L2 passes on valid deck (with LAMMPS binary)
2. L2 fails on invalid deck (syntax error)
3. L2 skips gracefully if no binary
4. L3 runs 20 steps and detects completion
5. L3 detects simulation explosions
6. Unified validator runs all levels

### 6.4 Files Modified
| File | Action |
|------|--------|
| `lammps_reaper/validation/l2_engine.py` | Modified |
| `lammps_reaper/validation/l3_physics.py` | Modified |
| `lammps_reaper/validation/__init__.py` | Modified |

---

## Navigation

⬅️ **Previous**: [03-agent.md](./03-agent.md)
➡️ **Next**: [05-testing.md](./05-testing.md) — Test Suite
