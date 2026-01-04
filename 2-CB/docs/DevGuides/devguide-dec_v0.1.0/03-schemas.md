# Core Schemas

This file contains Thrusts 2-3: FileType enumeration and FileGuide dataclass implementation.

---

## Thrust 2: FileType Enumeration

### 2.1 Objective

Define a comprehensive enumeration of all file types Campaign Builder can handle, with detection logic.

### 2.2 Background

The FileType enum categorizes input files so that:
- FileAnalyzers know which strategy to use
- Validation tools know which checks to apply
- Campaign Planner knows what information to expect

The enum must cover all file types from the SPECIFICATION.md document.

### 2.3 Subtasks

#### 2.3.1 Define FileType Enum

Create the FileType enumeration in `campaign_builder/schemas/file_guide.py`:

**Enum values (exactly these):**

| Value | Description | Common Extensions |
|-------|-------------|-------------------|
| LAMMPS_DATA | LAMMPS structure/topology file | .data, .lmp, .lammps |
| LAMMPS_INPUT | LAMMPS input script | .in, .lammps |
| QE_INPUT | Quantum ESPRESSO input | .in, .pwi |
| QE_OUTPUT | Quantum ESPRESSO output | .out, .pwo |
| POSCAR | VASP structure format | POSCAR, .vasp, .poscar |
| CIF | Crystallographic Information File | .cif |
| XYZ | Simple XYZ coordinate format | .xyz |
| PDB | Protein Data Bank format | .pdb |
| PDF | PDF document | .pdf |
| EXCEL | Excel spreadsheet | .xlsx, .xls |
| CSV | Comma-separated values | .csv |
| PYTHON_SCRIPT | Python code | .py |
| SHELL_SCRIPT | Shell script | .sh, .bash |
| JSON | JSON data | .json |
| YAML | YAML data | .yaml, .yml |
| TEXT | Generic plain text | .txt |
| UNKNOWN | Unrecognized format | any |

#### 2.3.2 Implement detect_file_type Function

Create a function that determines FileType from a file path:

**Function signature:**
```python
def detect_file_type(file_path: Path) -> FileType
```

**Detection logic (in priority order):**

1. **By filename (exact match):**
   - "POSCAR" or "CONTCAR" → POSCAR

2. **By extension:**
   - .data, .lmp → LAMMPS_DATA
   - .in → Check content to distinguish LAMMPS_INPUT vs QE_INPUT
   - .pwi → QE_INPUT
   - .pwo, .out → QE_OUTPUT
   - .vasp, .poscar → POSCAR
   - .cif → CIF
   - .xyz → XYZ
   - .pdb → PDB
   - .pdf → PDF
   - .xlsx, .xls → EXCEL
   - .csv → CSV
   - .py → PYTHON_SCRIPT
   - .sh, .bash → SHELL_SCRIPT
   - .json → JSON
   - .yaml, .yml → YAML
   - .txt → TEXT
   - .lammps → Check content for "units" (input) vs numeric data (data)

3. **By content inspection (for ambiguous extensions):**
   - .in files: Look for "&CONTROL" (QE) vs "units" (LAMMPS)
   - .lammps files: Look for "units" command vs numeric headers

4. **Default:** UNKNOWN

**Content inspection rules:**
- Read first 100 lines maximum
- Case-insensitive pattern matching
- Handle read errors gracefully (return UNKNOWN)

#### 2.3.3 Add Helper Methods to FileType

Add methods to the FileType enum:

**is_structure_file property:**
Returns True for: LAMMPS_DATA, POSCAR, CIF, XYZ, PDB

**is_input_script property:**
Returns True for: LAMMPS_INPUT, QE_INPUT

**is_document property:**
Returns True for: PDF, EXCEL, CSV

**is_binary property:**
Returns True for: PDF, EXCEL

**get_engine property:**
Returns "lammps" for LAMMPS_DATA, LAMMPS_INPUT
Returns "qe" for QE_INPUT, QE_OUTPUT
Returns None for others

### 2.4 Verification Steps

1. **Enum defined correctly:**
   - [ ] All 17 FileType values exist
   - [ ] Each has correct string value

2. **Detection works:**
   - [ ] detect_file_type("structure.data") → LAMMPS_DATA
   - [ ] detect_file_type("input.pwi") → QE_INPUT
   - [ ] detect_file_type("params.xlsx") → EXCEL
   - [ ] detect_file_type("paper.pdf") → PDF
   - [ ] detect_file_type("POSCAR") → POSCAR
   - [ ] detect_file_type("unknown.xyz") → XYZ

3. **Helper methods work:**
   - [ ] LAMMPS_DATA.is_structure_file → True
   - [ ] LAMMPS_INPUT.is_input_script → True
   - [ ] PDF.is_document → True
   - [ ] LAMMPS_INPUT.get_engine → "lammps"

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/schemas/file_guide.py` | Modified | Add FileType enum and detect_file_type |
| `tests/test_schemas.py` | Modified | Add FileType tests |

---

## Thrust 3: FileGuide Dataclass

### 3.1 Objective

Implement the complete FileGuide dataclass with all fields, to_markdown(), and to_dict() methods.

### 3.2 Background

FileGuide is the central contract between FileAnalyzer sub-agents and the Campaign Planner. It must:
- Capture all information needed for campaign planning
- Exclude unnecessary data (raw coordinates)
- Be compact enough for multiple FileGuides to fit in context
- Have clear methods for serialization

Refer to SPECIFICATION.md for the authoritative field definitions.

### 3.3 Subtasks

#### 3.3.1 Define Supporting Dataclasses

Create these dataclasses in `campaign_builder/schemas/file_guide.py`:

**AtomType:**
| Field | Type | Description |
|-------|------|-------------|
| id | int | Type ID (1-indexed) |
| mass | float | Atomic mass in g/mol |
| label | Optional[str] | Comment label if present |
| element | Optional[str] | Inferred element symbol |
| count | Optional[int] | How many atoms of this type |

**PairCoeff:**
| Field | Type | Description |
|-------|------|-------------|
| type1 | int | First atom type ID |
| type2 | int | Second atom type ID |
| style | Optional[str] | Pair sub-style if hybrid |
| params | List[float] | Numeric parameters |
| comment | Optional[str] | Trailing comment |
| source_line | Optional[int] | Line number in file |

**BondCoeff:**
| Field | Type | Description |
|-------|------|-------------|
| type_id | int | Bond type ID |
| style | Optional[str] | Bond sub-style |
| params | List[float] | Numeric parameters |
| source_line | Optional[int] | Line number |

**AngleCoeff:**
Same structure as BondCoeff.

**DihedralCoeff:**
Same structure as BondCoeff.

**BoxDimensions:**
| Field | Type | Description |
|-------|------|-------------|
| xlo | float | X lower bound |
| xhi | float | X upper bound |
| ylo | float | Y lower bound |
| yhi | float | Y upper bound |
| zlo | float | Z lower bound |
| zhi | float | Z upper bound |
| lx | float | X length (computed) |
| ly | float | Y length (computed) |
| lz | float | Z length (computed) |
| volume | float | Box volume (computed) |

**BoxTilt:**
| Field | Type | Description |
|-------|------|-------------|
| xy | float | XY tilt factor |
| xz | float | XZ tilt factor |
| yz | float | YZ tilt factor |

**Species (for QE):**
| Field | Type | Description |
|-------|------|-------------|
| symbol | str | Element symbol |
| mass | float | Atomic mass |
| pseudopotential | str | PP filename |

**CriticalSection:**
| Field | Type | Description |
|-------|------|-------------|
| name | str | Section name |
| start_line | int | Starting line |
| end_line | int | Ending line |
| excerpt | str | Content (truncated) |
| importance | str | Why it matters |

#### 3.3.2 Define FileGuide Core Fields

**Required core fields (all file types):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file_path | str | Yes | Absolute path to file |
| file_name | str | Yes | Just the filename |
| file_type | FileType | Yes | Detected file type |
| file_size_bytes | int | Yes | Size in bytes |
| sha256_hash | str | Yes | Hash for provenance |
| purpose | str | Yes | What file is for |
| summary | str | Yes | Key takeaways |
| confidence | str | Yes | high/medium/low |
| analysis_iterations | int | Yes | Agent turns used |
| line_count | Optional[int] | No | Lines (text files) |
| warnings | List[str] | No | Non-fatal issues |
| missing_info | List[str] | No | What couldn't be found |
| parse_errors | List[str] | No | Parsing errors |

#### 3.3.3 Define FileGuide LAMMPS Data Fields

**LAMMPS_DATA specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| atom_count | Optional[int] | Total atoms |
| atom_types_count | Optional[int] | Number of types |
| atom_types | Optional[List[AtomType]] | Type details |
| bond_count | Optional[int] | Total bonds |
| bond_types_count | Optional[int] | Bond type count |
| angle_count | Optional[int] | Total angles |
| angle_types_count | Optional[int] | Angle type count |
| dihedral_count | Optional[int] | Total dihedrals |
| dihedral_types_count | Optional[int] | Dihedral type count |
| improper_count | Optional[int] | Total impropers |
| box_dimensions | Optional[BoxDimensions] | Box size |
| box_tilt | Optional[BoxTilt] | Triclinic tilt |
| pair_style | Optional[str] | Pair style |
| pair_coeffs | Optional[List[PairCoeff]] | All pair coeffs |
| bond_style | Optional[str] | Bond style |
| bond_coeffs | Optional[List[BondCoeff]] | Bond coeffs |
| angle_style | Optional[str] | Angle style |
| angle_coeffs | Optional[List[AngleCoeff]] | Angle coeffs |
| dihedral_style | Optional[str] | Dihedral style |
| dihedral_coeffs | Optional[List[DihedralCoeff]] | Dihedral coeffs |
| has_velocities | Optional[bool] | Velocities exist |
| has_charges | Optional[bool] | Charges exist |
| atom_style_hint | Optional[str] | Inferred atom_style |

#### 3.3.4 Define FileGuide QE Fields

**QE_INPUT specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| calculation | Optional[str] | Calculation type |
| prefix | Optional[str] | Output prefix |
| pseudo_dir | Optional[str] | PP directory |
| outdir | Optional[str] | Output directory |
| ecutwfc | Optional[float] | Wavefunction cutoff |
| ecutrho | Optional[float] | Density cutoff |
| occupations | Optional[str] | Occupation type |
| smearing | Optional[str] | Smearing type |
| degauss | Optional[float] | Smearing width |
| nat | Optional[int] | Declared atom count |
| ntyp | Optional[int] | Declared species count |
| species | Optional[List[Species]] | Species info |
| kpoints_type | Optional[str] | K-point type |
| kpoints_grid | Optional[List[int]] | K-point mesh |
| kpoints_shift | Optional[List[int]] | Mesh shift |
| ibrav | Optional[int] | Bravais lattice |
| celldm | Optional[List[float]] | Cell parameters |
| cell_parameters_explicit | Optional[bool] | CELL_PARAMETERS present |

#### 3.3.5 Define FileGuide PDF Fields

**PDF specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| page_count | Optional[int] | Number of pages |
| title | Optional[str] | Document title |
| authors | Optional[List[str]] | Author names |
| abstract | Optional[str] | Abstract text |
| key_findings | Optional[List[str]] | Important results |
| parameters_mentioned | Optional[Dict[str, Any]] | Extracted params |
| methods_described | Optional[List[str]] | Methods referenced |
| force_fields_referenced | Optional[List[str]] | FF names |
| software_mentioned | Optional[List[str]] | Software refs |
| temperatures_mentioned | Optional[List[float]] | Temperatures |
| pressures_mentioned | Optional[List[float]] | Pressures |

#### 3.3.6 Define FileGuide Excel/CSV Fields

**Spreadsheet specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| sheets | Optional[List[str]] | Sheet names |
| active_sheet | Optional[str] | Analyzed sheet |
| columns | Optional[List[str]] | Column headers |
| row_count | Optional[int] | Data rows |
| column_types | Optional[Dict[str, str]] | Type per column |
| data_preview | Optional[str] | First rows |
| numeric_ranges | Optional[Dict[str, Dict]] | Min/max values |
| appears_to_be | Optional[str] | Data purpose guess |

#### 3.3.7 Define FileGuide Critical Sections

**For any file type:**

| Field | Type | Description |
|-------|------|-------------|
| critical_sections | Optional[List[CriticalSection]] | Key sections |

#### 3.3.8 Implement to_markdown Method

Create method `to_markdown(self) -> str`:

**Output format:**
```markdown
## File Guide: {file_name}

**Type:** {file_type.value}
**Size:** {formatted_size}
**Confidence:** {confidence}
**Path:** {file_path}

### Purpose
{purpose}

### Summary
{summary}

{TYPE_SPECIFIC_SECTIONS}

### Warnings
{warnings or "None"}

### Missing Information
{missing_info or "None"}
```

**Type-specific sections:**

For LAMMPS_DATA:
- Structure (atom count, box dimensions)
- Atom Types table
- Force Field (pair_style, coefficients)

For QE_INPUT:
- Calculation Settings
- Species table
- K-Points

For PDF:
- Document Info
- Key Findings
- Parameters Extracted

For EXCEL/CSV:
- Sheet Structure
- Columns
- Data Preview

**Formatting rules:**
- Tables for structured data
- Bullet lists for lists
- Bold labels, regular values
- Truncate long content with "..."

#### 3.3.9 Implement to_dict Method

Create method `to_dict(self) -> Dict[str, Any]`:

**Requirements:**
- Convert all fields to JSON-serializable types
- Convert FileType enum to string
- Convert nested dataclasses to dicts
- Exclude None values
- Include only populated optional fields

#### 3.3.10 Implement from_dict Class Method

Create method `from_dict(cls, data: Dict[str, Any]) -> FileGuide`:

**Requirements:**
- Parse FileType from string
- Reconstruct nested dataclasses
- Handle missing optional fields
- Validate required fields

#### 3.3.11 Add FileGuide Factory Methods

Create convenience methods:

**for_lammps_data:**
```python
@classmethod
def for_lammps_data(
    cls,
    file_path: str,
    sha256_hash: str,
    atom_count: int,
    atom_types: List[AtomType],
    box_dimensions: BoxDimensions,
    pair_coeffs: List[PairCoeff],
    **kwargs
) -> FileGuide
```

**for_qe_input:**
Similar factory for QE input files.

**for_pdf:**
Similar factory for PDF documents.

**for_excel:**
Similar factory for spreadsheets.

#### 3.3.12 Update Exports

Update `campaign_builder/schemas/__init__.py` to export:
- FileType
- FileGuide
- AtomType
- PairCoeff
- BondCoeff
- AngleCoeff
- DihedralCoeff
- BoxDimensions
- BoxTilt
- Species
- CriticalSection
- detect_file_type

### 3.4 Verification Steps

1. **FileGuide instantiation:**
   - [ ] Can create with only required fields
   - [ ] Optional fields default to None
   - [ ] Type validation works

2. **to_markdown() works:**
   - [ ] Returns valid markdown string
   - [ ] Includes all populated fields
   - [ ] Formats tables correctly
   - [ ] Handles missing optional fields

3. **to_dict() works:**
   - [ ] Returns JSON-serializable dict
   - [ ] Excludes None values
   - [ ] Converts enums to strings

4. **from_dict() works:**
   - [ ] Reconstructs FileGuide correctly
   - [ ] Handles nested structures
   - [ ] Validates required fields

5. **Factory methods work:**
   - [ ] for_lammps_data creates valid FileGuide
   - [ ] for_qe_input creates valid FileGuide
   - [ ] for_pdf creates valid FileGuide

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/schemas/file_guide.py` | Modified | Complete FileGuide implementation |
| `campaign_builder/schemas/__init__.py` | Modified | Export all types |
| `tests/test_schemas.py` | Modified | Add FileGuide tests |

---

## Implementation Notes

### Dataclass Configuration

Use `@dataclass` with appropriate settings:
- `frozen=False` (FileGuides may be modified)
- Use `field(default=None)` for optional fields
- Use `field(default_factory=list)` for list fields

### Type Hints

All fields must have complete type hints:
- Use `Optional[T]` for nullable fields
- Use `List[T]` for lists
- Use `Dict[str, T]` for dicts

### Computed Properties

BoxDimensions should compute lx, ly, lz, volume in `__post_init__`:
- lx = xhi - xlo
- ly = yhi - ylo
- lz = zhi - zlo
- volume = lx * ly * lz

### Next Thrust

After completing Thrusts 2-3, proceed to [03-schemas-errors.md](./03-schemas-errors.md) for error handling implementation, or if that doesn't exist, continue with the tools implementation in [04-tools-documents.md](./04-tools-documents.md).
