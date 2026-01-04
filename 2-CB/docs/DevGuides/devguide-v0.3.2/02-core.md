# Core Modules

## Thrust 1: Package Structure

### 1.1 Objective
Create the `lammps_reaper/` package with minimal, focused structure.

### 1.2 Subtasks

#### 1.2.1 Create Package Directory
Create `lammps_reaper/` at the repository root level alongside `campaign_builder/`.

#### 1.2.2 Create __init__.py
Export the main public API:
- `generate_deck()` - Main generation function
- `ReaperInput` - Input schema
- `ReaperOutput` - Output schema
- `validate_deck()` - Validation function

#### 1.2.3 Create Module Files
Create empty module files:
- `schemas.py` - Data classes
- `provider.py` - LLM provider
- `generator.py` - Generation logic
- `cli.py` - Command-line interface

#### 1.2.4 Create Validation Subpackage
Create `lammps_reaper/validation/`:
- `__init__.py` - Export validators
- `l0_placeholders.py` - Placeholder detection
- `l1_syntax.py` - LAMMPS syntax
- `l2_engine.py` - Engine check
- `l3_physics.py` - Physics validation

### 1.3 Verification Steps
1. Run `python -c "import lammps_reaper"` - should succeed
2. Run `python -c "from lammps_reaper import generate_deck"` - should succeed
3. Verify all module files exist

### 1.4 Files Created
| File | Action |
|------|--------|
| `lammps_reaper/__init__.py` | Created |
| `lammps_reaper/schemas.py` | Created |
| `lammps_reaper/provider.py` | Created |
| `lammps_reaper/generator.py` | Created |
| `lammps_reaper/cli.py` | Created |
| `lammps_reaper/validation/__init__.py` | Created |
| `lammps_reaper/validation/l0_placeholders.py` | Created |
| `lammps_reaper/validation/l1_syntax.py` | Created |
| `lammps_reaper/validation/l2_engine.py` | Created |
| `lammps_reaper/validation/l3_physics.py` | Created |

---

## Thrust 2: Schema Definitions

### 2.1 Objective
Define clear, minimal dataclasses for input/output.

### 2.2 Subtasks

#### 2.2.1 Define ReaperInput
Create input schema with:
- `intent: str` - Natural language description of desired simulation
- `files: List[Path]` - Optional list of input files (data files, potentials)
- `output_path: Optional[Path]` - Where to write the generated deck
- `lammps_binary: Optional[Path]` - Path to LAMMPS binary for L2 validation

#### 2.2.2 Define ReaperOutput
Create output schema with:
- `success: bool` - Whether generation succeeded
- `deck_content: str` - The generated LAMMPS input deck
- `output_path: Optional[Path]` - Where deck was written (if applicable)
- `validation: ValidationResult` - Validation results
- `errors: List[str]` - Any error messages
- `warnings: List[str]` - Any warning messages

#### 2.2.3 Define ValidationResult
Create validation result schema with:
- `overall_passed: bool` - All validation levels passed
- `l0: L0Result` - Placeholder check result
- `l1: L1Result` - Syntax check result
- `l2: L2Result` - Engine check result
- `l3: L3Result` - Physics check result
- `issues: List[str]` - Aggregated issues

#### 2.2.4 Define Individual Level Results
Create per-level result schemas:
- `L0Result`: passed, placeholders found
- `L1Result`: passed, syntax errors, warnings
- `L2Result`: passed, skipped, engine output
- `L3Result`: passed, physics warnings

#### 2.2.5 Define FileContext
Create file context schema for input files:
- `path: Path` - File path
- `content: str` - File content (first N lines for large files)
- `file_type: str` - Detected type (data, potential, include)

### 2.3 Verification Steps
1. Create instances of each schema with valid data
2. Verify serialization to dict works
3. Verify validation of required fields

### 2.4 Files Modified
| File | Action |
|------|--------|
| `lammps_reaper/schemas.py` | Modified - add all schemas |

---

## Navigation

⬅️ **Previous**: [01-overview.md](./01-overview.md)
➡️ **Next**: [03-agent.md](./03-agent.md) — LLM Integration
