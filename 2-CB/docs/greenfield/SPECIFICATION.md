# Specification

This document provides detailed specifications for Campaign Builder including data schemas, validation levels, agent prompts, error taxonomy, and tool definitions.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [What is a Campaign?](#what-is-a-campaign)
3. [Use Cases and Examples](#use-cases-and-examples)
4. [File Guide Schema](#file-guide-schema)
5. [Validation Framework (L0-L3)](#validation-framework-l0-l3)
6. [Agent Prompts](#agent-prompts)
7. [Error Taxonomy](#error-taxonomy)
8. [Tool Specifications](#tool-specifications)
9. [Extensibility Vision](#extensibility-vision)

---

## Core Concepts

### The Problem We Solve

Computational chemists spend significant time on tedious, error-prone tasks:

1. **Manual input file creation** - Writing LAMMPS/QE input scripts by hand, often starting from old examples or templates
2. **Parameter hunting** - Finding force field parameters across multiple files, papers, and databases
3. **Syntax debugging** - Fixing cryptic engine errors through trial and error
4. **Iteration cycles** - Repeated edit-run-fix loops that consume hours or days
5. **Context switching** - Moving between documentation, files, terminals, and simulators
6. **Reproducibility issues** - Forgetting which parameters came from where

### The Value Proposition

| Manual Workflow | With Campaign Builder |
|-----------------|----------------------|
| Hunt through data files for parameters | Agent extracts and validates parameters automatically |
| Write input scripts from scratch | Agent generates complete, validated input decks |
| Debug cryptic syntax errors | Agent validates before you run |
| Multiple edit-run-fix cycles | Single intent → working deck |
| Context switch between tools | Natural language describes what you want |
| Lose track of parameter sources | Every parameter has cited provenance |
| Uncertain if deck will run | L0-L3 validation guarantees acceptance |

### Key Principles

1. **Never Invent Physics** - All parameters must come from user-provided files or be explicitly flagged as defaults with citations. The system will NEVER guess or fabricate force field parameters.

2. **Validate Everything** - Every generated artifact passes through L0-L3 validation before delivery. An unvalidated deck is never considered complete.

3. **Fail Loudly** - Missing information is reported clearly with specific details about what is needed. The system never silently assumes or proceeds without critical data.

4. **Cite Sources** - Every parameter includes provenance (which file, which line, which section). Generated decks are self-documenting.

5. **Iterate Intelligently** - When validation fails, agents can analyze errors and attempt self-correction (up to a configurable limit).

6. **Graceful Degradation** - If some files fail to analyze, the system continues with available information and clearly reports what was skipped.

---

## What is a Campaign?

### Definition

A **campaign** is a complete, executable plan for running one or more related simulations. It represents the translation of user intent into validated, runnable simulation files.

A campaign answers the question: "What exactly do I need to run to achieve my scientific goal?"

### Campaign Components

Every campaign consists of:

| Component | Description |
|-----------|-------------|
| **Intent Analysis** | Parsed understanding of what the user wants to achieve |
| **Input Deck(s)** | The actual files the simulation engine runs (.in, .pwi, etc.) |
| **Execution Order** | Sequence and dependencies between simulation steps |
| **Parameter Manifest** | Every value used with its source citation |
| **Validation Report** | L0-L3 results proving each deck is valid |
| **Run Instructions** | How to execute the campaign |
| **Assumptions Log** | Any defaults used with justification |

### Campaign Complexity Levels

**Simple Campaign (Single Step)**
- One simulation run
- Single input deck
- Example: "Run an energy minimization"

**Sequential Campaign (Multi-Step)**
- Ordered simulation steps with dependencies
- Each step uses output from previous
- Example: "Minimize, then equilibrate at 300K, then run production"

**Parallel Campaign (Parameter Sweep)**
- Same simulation with varied parameters
- Independent runs that can execute simultaneously
- Example: "Run diffusion at 300K, 350K, and 400K"

**Workflow Campaign (Complex Pipeline)**
- Multiple stages with branching logic
- Conditional steps based on results
- Example: "Run equilibration, check energy stability, proceed to production if converged"

### Campaign Artifacts

A complete campaign produces:

| Artifact | Format | Description |
|----------|--------|-------------|
| Input deck(s) | .in, .pwi | Ready-to-run simulation files |
| Parameter manifest | JSON | Every parameter with source |
| Validation report | Markdown | L0-L3 results for each file |
| Run script | Shell | Command sequence to execute |
| Campaign README | Markdown | Human-readable summary |
| Provenance record | JSON | File hashes, timestamps, versions |

---

## Use Cases and Examples

### Use Case 1: Quick Equilibration Setup

**Scenario:** A researcher has a MOF structure file and wants to equilibrate it at room temperature before doing further analysis.

**User Input:**
- Intent: "Equilibrate this MOF structure at 300K for 1 nanosecond"
- Files: `mof_structure.data` (LAMMPS data file with force field parameters)

**What Campaign Builder Does:**
1. Analyzes `mof_structure.data` to extract atom types, masses, box dimensions, and force field coefficients
2. Identifies that this is a LAMMPS molecular simulation
3. Plans a two-step campaign: initial minimization → NVT equilibration
4. Generates `in.minimize` and `in.equilibrate` with proper parameters
5. Validates both files through L0-L3
6. Reports assumptions made (timestep choice, thermostat parameters)

**Output:**
- Two validated input decks ready to run
- Clear instructions: "Run in.minimize first, then in.equilibrate"
- All force field parameters traced back to specific lines in mof_structure.data

**Value:** What would take 30-60 minutes of manual work (finding parameters, writing scripts, debugging syntax) is completed in seconds.

### Use Case 2: Diffusion Study from Literature

**Scenario:** A researcher wants to replicate a CO2 diffusion study from a published paper.

**User Input:**
- Intent: "Calculate CO2 diffusion coefficient in this MOF at 333K, similar to the attached paper"
- Files: `framework.data`, `co2_params.xlsx`, `reference_paper.pdf`

**What Campaign Builder Does:**
1. Analyzes `framework.data` for MOF structure and force field
2. Reads `co2_params.xlsx` to extract CO2 molecule parameters
3. Parses `reference_paper.pdf` to understand methodology (ensemble, duration, analysis approach)
4. Identifies potential conflicts or missing information between sources
5. Plans a multi-step campaign:
   - Load structure
   - Insert CO2 molecules
   - Equilibrate system
   - Production run with MSD tracking
6. Generates complete input deck with proper MSD computation commands
7. Notes any discrepancies between paper methodology and provided parameters

**Output:**
- Complete diffusion simulation workflow
- Parameters cited to specific files (e.g., "CO2 epsilon from co2_params.xlsx, cell B5")
- Warnings if methodology differs from paper
- MSD output configured for diffusion coefficient calculation

**Value:** Reduces a multi-hour literature interpretation and file preparation task to a conversation.

### Use Case 3: DFT Geometry Optimization

**Scenario:** A materials scientist needs to optimize a crystal structure before calculating electronic properties.

**User Input:**
- Intent: "Relax this structure with PBE and calculate the band gap"
- Files: `POSCAR` (VASP structure format), `pseudopotentials/` (directory)

**What Campaign Builder Does:**
1. Reads POSCAR to identify species (Si, O in this case)
2. Scans pseudopotential directory for matching files
3. Plans QE workflow: vc-relax → scf → nscf → bands
4. Selects appropriate cutoffs based on pseudopotential requirements
5. Generates input files for each step with proper dependencies
6. Validates each file for QE syntax and physical reasonableness

**Output:**
- Series of QE input files with proper workflow
- K-point meshes appropriate for each calculation type
- Instructions for running sequence and extracting band gap

**Value:** Handles the complexity of multi-step DFT workflows automatically.

### Use Case 4: Parameter Sweep

**Scenario:** A researcher needs to study temperature dependence of a property.

**User Input:**
- Intent: "Run this simulation at 250K, 300K, 350K, and 400K"
- Files: `system.data`, `base_input.in`

**What Campaign Builder Does:**
1. Analyzes existing files to understand the simulation setup
2. Creates four variants of the input deck with temperature changes
3. Ensures all other parameters remain consistent
4. Names files systematically (e.g., `in.run_250K`, `in.run_300K`, etc.)
5. Generates a master run script for parallel or sequential execution

**Output:**
- Four validated input decks
- Each citing the temperature source as "user intent"
- Script to run all simulations with consistent output organization

**Value:** Eliminates error-prone manual file duplication and editing.

### Use Case 5: Troubleshooting Failed Simulation

**Scenario:** A researcher has a simulation that keeps crashing and doesn't know why.

**User Input:**
- Intent: "Help me figure out why this simulation crashes"
- Files: `broken_input.in`, `structure.data`, `error_log.txt`

**What Campaign Builder Does:**
1. Reads the input file and validates through L0-L3
2. Analyzes error log for common issues
3. Cross-references with structure file for consistency
4. Identifies specific problems (e.g., "pair_coeff missing for types 3-5", "cutoff larger than half box size")
5. Suggests specific fixes with line numbers
6. Optionally generates corrected input file

**Output:**
- Diagnosis of specific issues
- Concrete fix suggestions
- Optionally: corrected input deck

**Value:** Hours of debugging reduced to immediate diagnosis.

### What Users Shouldn't Expect (Current Scope)

The current version (v1.0) focuses on input deck generation. It does NOT:

- Execute simulations (run LAMMPS/QE)
- Analyze output trajectories
- Generate publication figures
- Perform literature searches
- Create structures from scratch (molecule building)

These capabilities are planned for future extensions (see Extensibility section).

---

## File Guide Schema

### Purpose

The File Guide is the contract between FileAnalyzer sub-agents and the Campaign Planner. It captures everything needed from a file in a compact, structured format that an LLM can reason about effectively.

A good File Guide:
- Enables campaign planning without re-reading the original file
- Contains no unnecessary data (especially no raw atom coordinates)
- Includes all force field parameters (critical for simulation)
- Documents what couldn't be determined

### Design Principles

1. **Compact** - A 500,000 line structure file becomes ~50 lines of structured data
2. **Complete** - Contains all information needed for campaign planning
3. **No Raw Data** - Never includes atom coordinates or large data blocks
4. **Typed** - Clear data types for each field
5. **Self-Describing** - Includes metadata about the analysis itself

### Core Fields (All File Types)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file_path | string | Yes | Absolute path to original file |
| file_name | string | Yes | Just the filename |
| file_type | FileType enum | Yes | Detected file type |
| file_size_bytes | integer | Yes | Size in bytes |
| line_count | integer | No | Number of lines (text files only) |
| sha256_hash | string | Yes | Hash for provenance tracking |
| purpose | string | Yes | What this file is for (1-2 sentences) |
| summary | string | Yes | Key takeaways (paragraph) |
| confidence | string | Yes | Extraction confidence: high/medium/low |
| analysis_iterations | integer | Yes | How many agent turns were used |
| warnings | list of strings | No | Non-fatal issues found |
| missing_info | list of strings | No | Information that couldn't be determined |
| parse_errors | list of strings | No | Errors during analysis |

### FileType Values

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

### LAMMPS Data File Fields

These fields apply when file_type is LAMMPS_DATA:

| Field | Type | Description |
|-------|------|-------------|
| atom_count | integer | Total number of atoms in the file |
| atom_types_count | integer | Number of distinct atom types |
| atom_types | list of AtomType | Detailed information per atom type |
| bond_count | integer | Total number of bonds |
| bond_types_count | integer | Number of distinct bond types |
| angle_count | integer | Total number of angles |
| angle_types_count | integer | Number of distinct angle types |
| dihedral_count | integer | Total number of dihedrals |
| dihedral_types_count | integer | Number of dihedral types |
| improper_count | integer | Total number of impropers |
| box_dimensions | BoxDimensions | Simulation box size |
| box_tilt | BoxTilt or null | Triclinic tilt factors (xy, xz, yz) |
| pair_style | string or null | Pair style if specified in header |
| pair_coeffs | list of PairCoeff | All pair coefficients found |
| bond_style | string or null | Bond style if specified |
| bond_coeffs | list of BondCoeff | All bond coefficients |
| angle_style | string or null | Angle style if specified |
| angle_coeffs | list of AngleCoeff | All angle coefficients |
| dihedral_style | string or null | Dihedral style if specified |
| has_velocities | boolean | Whether Velocities section exists |
| has_charges | boolean | Whether atoms have charge data |
| atom_style_hint | string or null | Inferred atom_style from format |

### AtomType Fields

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Type ID (1-indexed per LAMMPS convention) |
| mass | float | Atomic mass in g/mol |
| label | string or null | Comment label if present (e.g., "C_MOF") |
| element | string or null | Inferred element symbol |
| count | integer or null | How many atoms of this type exist |

### PairCoeff Fields

| Field | Type | Description |
|-------|------|-------------|
| type1 | integer | First atom type ID |
| type2 | integer | Second atom type ID |
| style | string or null | Pair sub-style if using hybrid |
| params | list of floats | Numeric parameters (epsilon, sigma, etc.) |
| comment | string or null | Any trailing comment |
| source_line | integer | Line number in original file |

### BoxDimensions Fields

| Field | Type | Description |
|-------|------|-------------|
| xlo | float | X lower bound |
| xhi | float | X upper bound |
| ylo | float | Y lower bound |
| yhi | float | Y upper bound |
| zlo | float | Z lower bound |
| zhi | float | Z upper bound |
| lx | float | X length (xhi - xlo) |
| ly | float | Y length (yhi - ylo) |
| lz | float | Z length (zhi - zlo) |
| volume | float | Box volume in cubic units |

### QE Input File Fields

| Field | Type | Description |
|-------|------|-------------|
| calculation | string | Calculation type: scf, relax, vc-relax, md, nscf, bands |
| prefix | string | Output file prefix |
| pseudo_dir | string | Pseudopotential directory path |
| outdir | string | Output directory path |
| ecutwfc | float | Wavefunction cutoff in Ry |
| ecutrho | float | Density cutoff in Ry |
| occupations | string | Occupation type: smearing, fixed, tetrahedra |
| smearing | string | Smearing type if used |
| degauss | float | Smearing width in Ry |
| nat | integer | Number of atoms declared |
| ntyp | integer | Number of species declared |
| species | list of Species | Atomic species information |
| kpoints_type | string | K-point specification: automatic, gamma, crystal |
| kpoints_grid | list of 3 integers | K-point mesh dimensions |
| kpoints_shift | list of 3 integers | K-point mesh shift |
| ibrav | integer | Bravais lattice index |
| celldm | list of floats | Cell dimension parameters |
| cell_parameters_explicit | boolean | Whether CELL_PARAMETERS card is present |

### PDF Document Fields

| Field | Type | Description |
|-------|------|-------------|
| page_count | integer | Number of pages |
| title | string or null | Document title from metadata or first page |
| authors | list of strings | Author names if identifiable |
| abstract | string or null | Abstract text if found |
| key_findings | list of strings | Important results or conclusions |
| parameters_mentioned | dictionary | Extracted parameter values |
| methods_described | list of strings | Computational methods referenced |
| force_fields_referenced | list of strings | Named force fields mentioned |
| software_mentioned | list of strings | Simulation software referenced |
| temperatures_mentioned | list of values | Temperatures found in text |
| pressures_mentioned | list of values | Pressures found in text |

### Excel/CSV Fields

| Field | Type | Description |
|-------|------|-------------|
| sheets | list of strings | Sheet names (Excel only) |
| active_sheet | string | Currently analyzed sheet |
| columns | list of strings | Column headers |
| row_count | integer | Number of data rows |
| column_types | dictionary | Inferred data type per column |
| data_preview | string | First 10-20 rows as formatted text |
| numeric_ranges | dictionary | Min/max values for numeric columns |
| appears_to_be | string | Guess at what the data represents |

### Critical Sections

For any file type, critical sections identify important parts of the file:

| Field | Type | Description |
|-------|------|-------------|
| name | string | Section name (e.g., "Pair Coeffs", "K_POINTS") |
| start_line | integer | Starting line number (1-indexed) |
| end_line | integer | Ending line number |
| excerpt | string | Actual content (truncated if necessary) |
| importance | string | Why this section matters for campaign planning |

---

## Validation Framework (L0-L3)

### Overview

Every generated input deck must pass through four levels of validation before being considered complete. This ensures users receive files that will actually run, not broken drafts.

Validation is **mandatory**. An input deck without validation results is never delivered to the user.

### Validation Levels Summary

| Level | Name | Purpose | Blocking? |
|-------|------|---------|-----------|
| L0 | Template Completeness | No placeholders remain | Yes |
| L1 | Syntax Validation | Correct engine syntax | Yes |
| L2 | Engine Acceptance | Engine can parse file | Yes (if available) |
| L3 | Physical Reasonableness | Makes scientific sense | Warnings only |

### L0: Template Completeness

**Purpose:** Ensure no placeholder text or incomplete sections remain in the generated deck.

**What It Checks:**

| Pattern Type | Examples | Description |
|--------------|----------|-------------|
| Handlebars | `{{temperature}}`, `{{epsilon}}` | Common template syntax |
| Shell variables | `${TEMP}`, `${CUTOFF}` | Shell-style placeholders |
| Angle brackets | `<INSERT_VALUE>`, `<TODO>` | XML-style placeholders |
| Explicit markers | `[PLACEHOLDER]`, `[FILL_IN]` | Obvious placeholders |
| TODO markers | `[TODO]`, `TODO:`, `FIXME:` | Work-in-progress markers |
| Question marks | `???`, `timestep ???` | Missing value indicators |
| Underscore fills | `_____`, `temperature _____` | Blank fill indicators |
| TBD markers | `TBD`, `N/A (replace)` | To-be-determined markers |
| XXX markers | `XXX`, `pair_coeff XXX` | Common placeholder pattern |

**Pass Criteria:** Zero placeholder patterns found anywhere in the file.

**Failure Behavior:**
- Report all found placeholders with line numbers
- Do NOT proceed to L1
- Agent may attempt to fill placeholders if information is available

**Why This Matters:** Placeholders indicate the generation was incomplete. Running a file with placeholders will fail or produce nonsense.

### L1: Syntax Validation

**Purpose:** Verify the input deck follows correct syntax for the target simulation engine.

**LAMMPS L1 Validation Checks:**

| Category | Check | Severity |
|----------|-------|----------|
| Required Commands | `units` command must be present | Error |
| Required Commands | `atom_style` command must be present | Error |
| Required Commands | `boundary` command must be present | Error |
| Command Order | `pair_style` must come before `pair_coeff` | Error |
| Command Order | `read_data` must come before commands that use atoms | Error |
| Command Order | Variables must be defined before use | Error |
| Completeness | All atom type pairs must have `pair_coeff` | Error |
| Completeness | If bonds exist, `bond_style` and `bond_coeff` required | Error |
| Syntax | Fix commands have minimum required arguments | Error |
| Syntax | Compute commands properly formed | Error |
| Syntax | Dump commands have valid formats | Error |
| Syntax | Group definitions reference valid type ranges | Error |
| References | `read_data` file path exists or is clearly intentional | Warning |
| References | `include` file path exists | Warning |
| Reasonableness | Timestep is a positive number | Warning |
| Reasonableness | At least one `run` command present | Warning |

**QE L1 Validation Checks:**

| Category | Check | Severity |
|----------|-------|----------|
| Required Namelists | `&CONTROL` namelist must be present | Error |
| Required Namelists | `&SYSTEM` namelist must be present | Error |
| Required Namelists | `&ELECTRONS` namelist must be present | Error |
| Namelist Syntax | Every `&` has matching `/` | Error |
| Namelist Syntax | No duplicate parameter names in same namelist | Error |
| Required Cards | `ATOMIC_SPECIES` card must be present | Error |
| Required Cards | `ATOMIC_POSITIONS` card must be present | Error |
| Required Cards | `K_POINTS` card must be present | Error |
| Consistency | `nat` value matches number of ATOMIC_POSITIONS | Error |
| Consistency | `ntyp` value matches number of ATOMIC_SPECIES | Error |
| Consistency | All species in ATOMIC_POSITIONS appear in ATOMIC_SPECIES | Error |
| Completeness | `ecutwfc` must be defined | Error |
| Cell Definition | Either `ibrav` + `celldm` OR `CELL_PARAMETERS` must be present | Error |
| References | Pseudopotential files specified for all species | Warning |
| Reasonableness | `ecutwfc` is positive and reasonable (10-200 Ry) | Warning |

**Pass Criteria:** Zero errors. Warnings are reported but don't block.

**Failure Behavior:**
- Report all syntax errors with line numbers
- Provide specific suggestions for each error
- Do NOT proceed to L2
- Agent may attempt repairs

### L2: Engine Acceptance

**Purpose:** Verify the actual simulation engine can parse and accept the input file.

**How It Works:**

For LAMMPS:
1. Execute LAMMPS with the input file
2. Use minimal run (0 steps) or parse-only mode if available
3. Capture and analyze any error messages
4. Check for successful initialization
5. Kill process before actual simulation runs

For Quantum ESPRESSO:
1. Execute pw.x with the input file
2. Allow it to read and parse input
3. Capture any error messages
4. Check for input acceptance
5. Kill before SCF iteration starts (or use dry-run flag)

**What L2 Catches That L1 Misses:**
- Incompatible command combinations
- Missing potential files
- Memory issues with large systems
- MPI configuration problems
- Numerical instabilities in setup

**Pass Criteria:** Engine initializes without errors.

**When Engine Unavailable:**
- If LAMMPS/QE binary is not installed, L2 is skipped
- Clear warning is issued: "L2 validation skipped - engine not available"
- Deck is delivered with L0+L1 validation only
- User is informed they should test before production runs

**Failure Behavior:**
- Report engine error messages verbatim
- Provide interpretation of what the error means
- Suggest specific fixes
- Agent may attempt to repair and re-validate

### L3: Physical Reasonableness

**Purpose:** Verify the simulation makes physical sense and is likely to produce meaningful scientific results.

**L3 is advisory.** It catches issues that won't prevent the simulation from running but may cause it to produce garbage results or waste computational resources.

**Universal L3 Checks:**

| Check | Description | Severity |
|-------|-------------|----------|
| Temperature range | 0 < T < 10000 K for most systems | Warning if outside |
| Pressure range | Typical range for application | Warning if extreme |
| Box vs cutoff | Cutoff must be < half minimum box dimension | Error |
| Density check | Atom density within reasonable range | Warning if extreme |
| Timestep appropriateness | Matches fastest motion in system | Warning |

**LAMMPS-Specific L3 Checks:**

| Check | Description | Severity |
|-------|-------------|----------|
| Units consistency | All commands use same unit system | Error |
| Thermostat damping | Damping parameter reasonable for units | Warning |
| Barostat coupling | Coupling time reasonable | Warning |
| Neighbor settings | Skin distance appropriate for cutoff | Warning |
| Output frequency | Not too sparse (miss dynamics) or too frequent (huge files) | Info |
| Run length | Sufficient for equilibration/production goals | Info |
| Ensemble appropriateness | NVT for equilibration, NVE for dynamics, etc. | Info |

**QE-Specific L3 Checks:**

| Check | Description | Severity |
|-------|-------------|----------|
| Cutoff ratio | ecutrho/ecutwfc appropriate for PP type | Warning |
| K-point density | Sufficient for accuracy vs. cost | Warning |
| Convergence threshold | Appropriate for calculation type | Info |
| Mixing parameters | Beta values in reasonable range | Warning |
| Smearing width | Appropriate for metallic/insulating system | Warning |

**Property-Specific L3 Checks:**

For Diffusion Calculations:
- MSD compute is defined and outputs correctly
- Ensemble is NVE or NVT (not NPT during measurement)
- Run length sufficient to reach diffusive regime
- Output frequency appropriate for MSD analysis
- No artificial constraints on diffusing species

For Equilibration:
- Temperature control active
- Reasonable equilibration duration
- Gradual heating if starting far from target
- Energy/temperature monitoring enabled

For Production:
- Data collection commands present
- Trajectory output if needed
- Appropriate sampling frequency
- Checkpoint/restart enabled for long runs

**Pass Criteria:** Zero errors. Warnings and info messages are reported.

**Failure Behavior:** Report all issues with explanations. L3 failures do not block delivery but are prominently displayed.

### Validation Result Structure

Each validation level produces a structured result:

| Field | Type | Description |
|-------|------|-------------|
| level | string | L0, L1, L2, or L3 |
| passed | boolean | Whether this level passed |
| checks_run | integer | Number of individual checks performed |
| checks_passed | integer | Number that passed |
| checks_failed | integer | Number that failed |
| errors | list of issues | Blocking problems |
| warnings | list of issues | Non-blocking concerns |
| info | list of issues | Informational notes |
| engine_output | string or null | Raw engine output (L2 only) |
| suggestions | list of strings | Recommended improvements |
| duration_ms | integer | How long validation took |

### Validation Issue Structure

| Field | Type | Description |
|-------|------|-------------|
| code | string | Unique issue identifier |
| message | string | Human-readable description |
| line_number | integer or null | Line in input file |
| column | integer or null | Column position if relevant |
| context | string or null | Surrounding text |
| suggestion | string or null | How to fix |
| severity | string | error, warning, or info |

### Validation Flow

The validation process follows this sequence:

1. **Run L0** on generated content
   - If L0 fails: Stop, report placeholders, optionally attempt fix
   - If L0 passes: Proceed to L1

2. **Run L1** with engine-specific checks
   - If L1 fails: Stop, report syntax errors, optionally attempt fix
   - If L1 passes: Proceed to L2

3. **Run L2** if engine is available
   - If engine unavailable: Skip L2 with warning
   - If L2 fails: Stop, report engine errors, optionally attempt fix
   - If L2 passes: Proceed to L3

4. **Run L3** physical checks
   - L3 never blocks delivery
   - Report all findings as warnings/info

5. **Compile Report** with all results

### Repair Loop

When validation fails, the agent may attempt repairs:

1. Analyze the specific error
2. Identify the root cause
3. Generate a fix
4. Re-run validation from the failed level
5. Maximum 3 repair attempts per level
6. If repairs fail, report the issue to user with context

---

## Agent Prompts

### FileAnalyzer Sub-Agent System Prompt

The FileAnalyzer sub-agent receives a single file and must produce a comprehensive File Guide. The prompt emphasizes:

**Core Instructions:**
- Check file size before reading (use line count to decide strategy)
- For large files (>500 lines), use targeted reading with grep to find sections
- Extract ALL force field parameters - these are critical
- Never extract raw atom coordinates
- Always note what couldn't be determined

**File-Type Specific Guidance:**

For LAMMPS Data Files:
- Read header section for counts and box dimensions
- Find and extract Masses section
- Find and extract all Coeffs sections (Pair, Bond, Angle, Dihedral)
- Note the existence of Atoms section but do not read coordinates
- Infer atom_style from data format if possible

For QE Input Files:
- Parse all namelists and extract key parameters
- Identify calculation type and convergence settings
- Note all species and their pseudopotentials
- Extract cell and k-point information

For PDFs:
- Extract full text using the read_pdf tool
- Identify the document type (paper, manual, data sheet)
- Look for specific parameters with values
- Note any force field references or methodology

For Excel/CSV:
- Read column headers to understand data structure
- Preview first rows to understand content
- Identify what the data represents
- Note any parameter columns that might be relevant

**Output Requirements:**
- Structured JSON format
- All required fields populated
- Confidence level based on extraction quality
- Clear list of anything that couldn't be determined

### Campaign Planner Agent System Prompt

The Campaign Planner receives user intent plus File Guides and must produce a complete campaign. The prompt emphasizes:

**Input Understanding:**
- Parse user intent to identify target property, simulation type, and conditions
- Analyze each File Guide to understand what information is available
- Trace file dependencies (read_data references, restart files, include directives)
- Identify any conflicts between files
- Determine if all required information is present

The agent generates fresh output by default - user-provided files serve as context, not templates to modify. With minimal input, it generates a basic campaign. With extensive input (existing scripts, workflows), it has richer context to generate a more comprehensive campaign. The agent determines what can be generated fresh versus what must be referenced (e.g., complex structures that cannot reasonably be recreated).

**Missing Information Handling:**
- If force field parameters are missing: STOP and report
- If structure information is missing: STOP and report
- Never proceed with incomplete critical information
- Provide specific details about what is needed

**Generation Requirements:**
- Use EXACT parameters from File Guides with line citations
- Add comments explaining the source of each value
- Follow engine best practices and conventions
- Include appropriate output and monitoring commands

**Validation Integration:**
- Always run validation on generated files
- If validation fails, analyze error and attempt fix
- Maximum 3 repair attempts before reporting to user
- Include validation results in final output

**Output Format:**
- Campaign plan with clear step descriptions
- All generated files listed with purposes
- Master run script with correct execution order
- Campaign README documenting the workflow
- Parameter manifest with sources
- Dependency information (which files reference which)
- Validation results for generated files
- Any assumptions made with justifications
- Warnings about potential issues or inconsistencies

---

## Error Taxonomy

### Error Code Structure

Error codes follow the pattern: E + category + specific code

| Category | Code Range | Description |
|----------|------------|-------------|
| File | E100-E199 | File access and reading errors |
| Analysis | E200-E299 | File analysis and extraction errors |
| Validation | E300-E399 | L0-L3 validation errors |
| Campaign | E400-E499 | Campaign planning and generation errors |
| System | E500-E599 | Infrastructure and API errors |

### Error Severity Levels

| Level | Behavior | User Experience |
|-------|----------|-----------------|
| Info | Continue, note for user | Informational message |
| Warning | Continue, warn user | Yellow/orange indicator |
| Error | Skip this item, continue others | Red indicator, item skipped |
| Fatal | Stop entire process | Red indicator, process halted |

### File Errors (E1xx)

| Code | Name | Severity | Description | Suggestion |
|------|------|----------|-------------|------------|
| E101 | FILE_NOT_FOUND | Error | Specified file does not exist | Check file path and try again |
| E102 | FILE_TOO_LARGE | Error | File exceeds size limit | Split file or extract relevant sections |
| E103 | FILE_UNREADABLE | Error | Cannot read file content | Check file permissions |
| E104 | FILE_TYPE_UNKNOWN | Warning | Cannot determine file type | Specify file type manually |
| E105 | FILE_EMPTY | Error | File has no content | Provide a file with content |
| E106 | BINARY_UNSUPPORTED | Error | Binary file not PDF/Excel | Convert to supported format |
| E107 | FILE_CORRUPTED | Error | File structure is invalid | Re-obtain file |
| E108 | ENCODING_ERROR | Error | Cannot decode file text | Check file encoding |
| E109 | PERMISSION_DENIED | Error | No read access to file | Check file permissions |

### Analysis Errors (E2xx)

| Code | Name | Severity | Description | Suggestion |
|------|------|----------|-------------|------------|
| E201 | ANALYSIS_TIMEOUT | Error | Analysis exceeded time limit | File may be too complex |
| E202 | MAX_ITERATIONS | Warning | Hit iteration limit | Analysis may be incomplete |
| E203 | EXTRACTION_FAILED | Error | Could not extract required info | Check file format |
| E204 | PARSE_ERROR | Error | Could not parse file format | Verify file is valid |
| E205 | AGENT_ERROR | Fatal | Agent crashed or returned invalid output | Retry or report bug |
| E206 | NO_PARAMS_FOUND | Error | No force field parameters found | Provide file with parameters |
| E207 | INCOMPLETE_PARAMS | Warning | Some parameters missing | May need additional files |
| E208 | CONFLICTING_INFO | Warning | Contradictory information found | Review source files |
| E209 | PDF_EXTRACTION_POOR | Warning | PDF text extraction was incomplete | Try different PDF or OCR |

### Validation Errors (E3xx)

| Code | Name | Severity | Description | Suggestion |
|------|------|----------|-------------|------------|
| E301 | L0_PLACEHOLDER | Error | Template placeholder found | Fill in required values |
| E302 | L1_SYNTAX | Error | Syntax validation failed | Fix syntax errors |
| E303 | L2_ENGINE_REJECT | Error | Engine rejected input | Fix engine-specific errors |
| E304 | L3_UNREASONABLE | Warning | Physically unreasonable values | Review parameter choices |
| E305 | ENGINE_NOT_FOUND | Warning | Engine binary not available | Install engine for L2 validation |
| E306 | VALIDATION_TIMEOUT | Error | Validation timed out | System may be overloaded |
| E307 | L1_MISSING_REQUIRED | Error | Required command/section missing | Add required elements |
| E308 | L1_INVALID_ORDER | Error | Commands in wrong order | Reorder commands |
| E309 | L2_MISSING_FILE | Error | Referenced file not found | Provide required files |
| E310 | L3_CUTOFF_BOX | Error | Cutoff larger than half box | Reduce cutoff or increase box |
| E311 | REPAIR_FAILED | Error | Could not fix validation error | Manual intervention needed |

### Campaign Errors (E4xx)

| Code | Name | Severity | Description | Suggestion |
|------|------|----------|-------------|------------|
| E401 | MISSING_FORCE_FIELD | Fatal | No force field parameters available | Provide force field file |
| E402 | MISSING_STRUCTURE | Fatal | No structure file provided | Provide structure file |
| E403 | CONFLICTING_PARAMS | Error | Parameters conflict between files | Resolve conflicts |
| E404 | UNSUPPORTED_ENGINE | Error | Requested engine not supported | Use LAMMPS or QE |
| E405 | INTENT_UNCLEAR | Error | Cannot parse user intent | Clarify what you want |
| E406 | MISSING_CRITICAL | Fatal | Critical information unavailable | Provide required data |
| E407 | INCOMPATIBLE_FILES | Error | Files use incompatible settings | Check units, styles |
| E408 | NO_SOLUTION | Error | Cannot generate valid campaign | Simplify request |
| E409 | PARAMETER_NOT_FOUND | Error | Specific required parameter missing | Provide parameter value |
| E410 | DEPENDENCY_ERROR | Error | Step dependency cannot be resolved | Check workflow logic |

### System Errors (E5xx)

| Code | Name | Severity | Description | Suggestion |
|------|------|----------|-------------|------------|
| E501 | SDK_ERROR | Fatal | Claude Agent SDK error | Retry or report bug |
| E502 | API_RATE_LIMIT | Error | API rate limit exceeded | Wait and retry |
| E503 | API_TIMEOUT | Error | API request timed out | Retry request |
| E504 | API_AUTH_FAILED | Fatal | API authentication failed | Check API key |
| E505 | UNEXPECTED_ERROR | Fatal | Unhandled exception | Report bug |
| E506 | CONTEXT_OVERFLOW | Error | Context window exceeded | Reduce input size |
| E507 | TOOL_ERROR | Error | Custom tool failed | Check tool configuration |
| E508 | WORKSPACE_ERROR | Error | Cannot access workspace | Check directory permissions |

---

## Tool Specifications

### Built-in Tools (from Claude Agent SDK)

The following tools are provided by the Claude Agent SDK:

| Tool | Parameters | Description |
|------|------------|-------------|
| Read | path, offset?, limit? | Read file content with optional range |
| Glob | pattern, path? | Find files matching glob pattern |
| Grep | pattern, path, flags? | Search for regex pattern in files |
| Bash | command, timeout? | Execute shell command |
| Write | path, content | Write content to file |

### Custom Tool: read_pdf

**Purpose:** Extract text content from PDF documents for analysis.

**When to Use:** When analyzing PDF files (research papers, manuals, data sheets).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | Path to PDF file |
| pages | string | No | Page range (e.g., "1-5", "1,3,7") |
| max_chars | integer | No | Maximum characters to return (default: 50000) |

**Output:**

| Field | Description |
|-------|-------------|
| page_count | Total pages in document |
| title | Document title from metadata if available |
| text | Extracted text content |
| extraction_quality | Estimate: high (searchable PDF), medium, low (scanned) |

**Behavior Notes:**
- Returns extracted text preserving page structure
- Truncates with warning if exceeds max_chars
- Reports if PDF appears to be scanned images (would need OCR)
- Handles password-protected PDFs with appropriate error

### Custom Tool: read_excel

**Purpose:** Read Excel spreadsheet data for parameter extraction.

**When to Use:** When analyzing Excel files with simulation parameters or data.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | Path to Excel file |
| sheet | string | No | Sheet name or index (default: first sheet) |
| max_rows | integer | No | Maximum rows to return (default: 100) |

**Output:**

| Field | Description |
|-------|-------------|
| sheets | List of all sheet names in workbook |
| current_sheet | Sheet being returned |
| columns | List of column headers |
| row_count | Total rows in sheet |
| data | Formatted text representation of data |
| column_types | Inferred type per column |

**Behavior Notes:**
- Returns data formatted as text table for LLM processing
- Preserves numeric precision
- Handles merged cells appropriately
- Reports any parsing warnings

### Custom Tool: read_csv

**Purpose:** Read CSV file data.

**When to Use:** When analyzing CSV files with tabular data.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | Path to CSV file |
| delimiter | string | No | Field delimiter (default: auto-detect) |
| max_rows | integer | No | Maximum rows to return (default: 100) |

**Output:**

| Field | Description |
|-------|-------------|
| columns | List of column headers |
| row_count | Total rows |
| data | Formatted text representation |
| column_types | Inferred type per column |
| delimiter_used | The delimiter that was detected/used |

### Custom Tool: validate_deck

**Purpose:** Run L0-L3 validation on a generated input deck.

**When to Use:** After generating any simulation input file.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | Path to input deck file |
| engine | string | Yes | Target engine: "lammps" or "qe" |
| levels | list of strings | No | Levels to run (default: all available) |
| structure_file | string | No | Structure file for context checks |

**Output:**

| Field | Description |
|-------|-------------|
| overall_passed | Boolean - true only if all run levels passed |
| l0 | L0 validation result |
| l1 | L1 validation result |
| l2 | L2 validation result (null if engine unavailable) |
| l3 | L3 validation result |
| all_issues | Combined list of all issues found |
| suggestions | Improvement recommendations |
| can_run | Whether deck is safe to run (L0+L1 pass minimum) |

### Custom Tool: get_structure_summary

**Purpose:** Smart extraction from structure files without loading full atom data.

**When to Use:** As an alternative to raw Read for large structure files.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | Path to structure file |
| format | string | No | File format hint (auto-detect if not specified) |

**Output:**

| Field | Description |
|-------|-------------|
| format | Detected/confirmed format |
| atom_count | Total atoms |
| atom_types | Structured atom type information |
| box | Box dimensions |
| coefficients | All force field coefficients found |
| sections_found | List of sections present in file |
| metadata | Additional format-specific data |

**Behavior Notes:**
- Parses file header for metadata
- Extracts all coefficient sections
- NEVER reads atom coordinate sections
- Returns compact, campaign-planning-ready data

---

## Extensibility Vision

### Current Scope (Version 1.0)

Campaign Builder v1.0 focuses exclusively on **input deck generation**:

- User provides natural language intent + files
- System analyzes files and extracts relevant information
- System generates validated simulation input decks
- Output: Ready-to-run files with provenance

This core capability establishes the foundation for future expansion.

### The Vision: Complete Autonomous Research Assistant

The ultimate goal is a system where users can describe their research goals in natural language, and the system handles everything:

**User says:** "Study how CO2 diffuses through MOF-5 at different temperatures and write a paper about it"

**System does:**
1. Research literature for relevant force fields and methods
2. Build or obtain appropriate structure files
3. Generate simulation campaigns for multiple temperatures
4. Execute simulations (or submit to HPC)
5. Monitor progress and handle errors
6. Analyze results (calculate diffusion coefficients)
7. Compare with literature values
8. Generate figures and tables
9. Draft paper sections

This vision guides the architecture even when implementing basic features.

### Planned Extension: Structured File Generation

**Purpose:** Create data files from natural language descriptions instead of just reading existing files.

**Capability:**
- "Create a 50x50x50 Angstrom box with 1000 CO2 molecules at random positions"
- "Generate a supercell of MIL-53 MOF, 2x2x3"
- "Add 500 water molecules to this framework"

**Requirements:**
- Molecule template library with geometries
- Crystal structure database integration
- Box packing algorithms
- Force field parameter database
- Structure file writers for various formats

**How It Fits:**
- Adds a "Structure Generator" agent before the Campaign Planner
- File Guides can come from generation as well as analysis
- Same validation framework applies to generated structures

### Planned Extension: Post-Processing Analysis

**Purpose:** Analyze simulation results and generate insights.

**Capability:**
- "Calculate the diffusion coefficient from this trajectory"
- "Generate an RDF plot for this simulation"
- "Compare these three runs and summarize differences"

**Requirements:**
- Trajectory file reading (various formats)
- Standard analysis implementations (MSD, RDF, coordination, etc.)
- Statistical analysis capabilities
- Visualization/plotting support
- Result interpretation prompts

**How It Fits:**
- Adds "Analyzer" agent after simulation execution
- Works with trajectory and output files
- Produces figures, data files, and narrative summaries

### Planned Extension: Execution Management

**Purpose:** Actually run simulations, not just generate input files.

**Capability:**
- Execute simulations locally or on HPC clusters
- Monitor progress and detect issues
- Handle restarts and checkpointing
- Manage job queues

**Requirements:**
- Job submission systems (SLURM, PBS, etc.)
- Progress monitoring
- Error detection and recovery
- Resource management
- Output collection

**How It Fits:**
- Adds "Executor" agent between generation and analysis
- Tracks job status and handles failures
- Collects outputs for analysis

### Planned Extension: Research Assistant

**Purpose:** Help with literature review and parameter research.

**Capability:**
- "Find force field parameters for ZIF-8"
- "What methodology did people use for MOF diffusion studies?"
- "Compare my results with published data"

**Requirements:**
- Web search integration
- PDF parsing for parameter extraction
- Citation management
- Parameter database building
- Comparison tools

**How It Fits:**
- Can run before file analysis to find missing parameters
- Integrates with campaign planning for methodology decisions
- Helps with result interpretation

### Planned Extension: Iterative Refinement

**Purpose:** Learn from simulation results and refine approach.

**Capability:**
- Run simulation → check convergence → adjust and rerun
- Compare with experimental data → refine parameters
- Automatic parameter optimization

**Requirements:**
- Result evaluation criteria
- Parameter adjustment strategies
- Convergence detection
- Experiment/simulation comparison

**How It Fits:**
- Creates feedback loop in the workflow
- Enables autonomous research campaigns
- Builds toward machine learning integration

### Architecture for Extensibility

The system is designed as a pipeline of specialized agents:

**Current Pipeline (v1.0):**
1. Intent Parser → Understands user goal
2. File Analyzer (multiple) → Understands input files
3. Campaign Planner → Designs simulation strategy
4. Deck Generator → Writes input files
5. Validator → Ensures correctness

**Future Pipeline (vision):**
1. Research Agent → Finds missing information
2. Structure Generator → Creates needed files
3. Intent Parser → Understands user goal
4. File Analyzer → Understands inputs
5. Campaign Planner → Designs strategy
6. Deck Generator → Writes files
7. Validator → Ensures correctness
8. Executor → Runs simulations
9. Monitor → Tracks progress
10. Analyzer → Processes results
11. Reporter → Generates outputs
12. Iterator → Plans next steps

Each extension follows a standard interface allowing modular addition without disrupting existing functionality.

### Extension Interface

Every agent/extension implements:

| Method | Description |
|--------|-------------|
| can_handle(intent, context) | Whether this extension applies |
| get_required_inputs() | What inputs it needs |
| get_produced_outputs() | What it produces |
| execute(inputs) | Main execution logic |
| validate_output(output) | Verify output correctness |
| get_status() | Current execution status |

This interface enables:
- Dynamic pipeline construction based on user intent
- Parallel execution where dependencies allow
- Clear data flow between stages
- Easy addition of new capabilities
