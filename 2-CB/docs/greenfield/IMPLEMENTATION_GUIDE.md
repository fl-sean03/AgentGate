# Implementation Guide

This guide provides detailed specifications for building Campaign Builder from scratch. It describes what needs to be built, how components should interact, and what behaviors are required - without providing actual code.

The implementation should follow these specifications precisely while using appropriate patterns for the chosen language and framework.

---

## Table of Contents

1. [Prerequisites and Setup](#prerequisites-and-setup)
2. [Project Structure](#project-structure)
3. [Implementation Phases](#implementation-phases)
4. [Phase 1: Project Foundation](#phase-1-project-foundation)
5. [Phase 2: Core Schemas](#phase-2-core-schemas)
6. [Phase 3: Custom Tools](#phase-3-custom-tools)
7. [Phase 4: Agent Prompts](#phase-4-agent-prompts)
8. [Phase 5: FileAnalyzer Sub-Agent](#phase-5-fileanalyzer-sub-agent)
9. [Phase 6: Campaign Planner Agent](#phase-6-campaign-planner-agent)
10. [Phase 7: Orchestration Runner](#phase-7-orchestration-runner)
11. [Phase 8: Command-Line Interface](#phase-8-command-line-interface)
12. [Phase 9: Validation Pipeline](#phase-9-validation-pipeline)
13. [Phase 10: Testing Strategy](#phase-10-testing-strategy)
14. [Development Milestones](#development-milestones)

---

## Prerequisites and Setup

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Python | 3.10+ | Runtime environment |
| pip | Latest | Package manager |
| git | Any | Version control |

### Optional Software (for L2 Validation)

| Software | Purpose |
|----------|---------|
| LAMMPS | L2 validation of LAMMPS input decks |
| Quantum ESPRESSO | L2 validation of QE input decks |

### Required API Access

- Anthropic API key from console.anthropic.com
- Sufficient API credits for development and testing

### Development Environment

Create a Python virtual environment, install dependencies in editable mode, and configure API key via environment variable or .env file.

### Dependencies

The project requires these Python packages:

| Package | Purpose |
|---------|---------|
| claude-agent-sdk | Core agent functionality |
| click | Command-line interface |
| python-dotenv | Environment variable loading |
| pymupdf | PDF text extraction |
| openpyxl | Excel file reading |
| pandas | Data manipulation |

Development dependencies:

| Package | Purpose |
|---------|---------|
| pytest | Testing framework |
| pytest-asyncio | Async test support |
| ruff | Code linting and formatting |

---

## Project Structure

### Directory Layout

```
campaign-builder/
├── pyproject.toml
├── README.md
├── .env
├── .gitignore
│
├── campaign_builder/
│   ├── __init__.py
│   ├── cli.py
│   │
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── file_analyzer.py
│   │   ├── campaign_planner.py
│   │   ├── runner.py
│   │   └── prompts.py
│   │
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── documents.py
│   │   └── validation.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── file_guide.py
│   │   └── errors.py
│   │
│   └── utils/
│       ├── __init__.py
│       └── hashing.py
│
├── tests/
│   ├── __init__.py
│   ├── test_schemas.py
│   ├── test_tools.py
│   ├── test_file_analyzer.py
│   ├── test_campaign_planner.py
│   └── fixtures/
│       ├── sample.data
│       ├── sample.in
│       └── sample.pdf
│
└── docs/
    ├── README.md
    ├── ARCHITECTURE.md
    ├── SPECIFICATION.md
    ├── IMPLEMENTATION_GUIDE.md
    ├── BACKGROUND.md
    └── CLAUDE.md
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| cli.py | Command-line entry point |
| agent/file_analyzer.py | FileAnalyzer sub-agent logic |
| agent/campaign_planner.py | Campaign Planner agent logic |
| agent/runner.py | Multi-agent orchestration |
| agent/prompts.py | All system prompts |
| tools/documents.py | PDF and Excel reading tools |
| tools/validation.py | L0-L3 validation logic |
| schemas/file_guide.py | FileGuide and related types |
| schemas/errors.py | Error types and handling |
| utils/hashing.py | File hashing for provenance |

---

## Implementation Phases

Build the system in this order, testing each phase before proceeding:

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| 1 | Project Foundation | Working project structure, dependencies installed |
| 2 | Core Schemas | FileGuide, error types defined and tested |
| 3 | Custom Tools | PDF, Excel, validation tools working |
| 4 | Agent Prompts | All prompts written and reviewed |
| 5 | FileAnalyzer | Sub-agent can analyze files |
| 6 | Campaign Planner | Main agent can generate decks |
| 7 | Orchestration | Full pipeline working |
| 8 | CLI | User-facing interface complete |
| 9 | Validation | L0-L3 validation integrated |
| 10 | Testing | Comprehensive test coverage |

---

## Phase 1: Project Foundation

### Objectives

- Create project directory structure
- Configure package management
- Set up development environment
- Verify dependencies install correctly

### Tasks

1. Create root directory and all subdirectories as specified in Project Structure
2. Create all __init__.py files to make packages importable
3. Create pyproject.toml with all dependencies
4. Create .gitignore excluding .env, __pycache__, .venv, etc.
5. Create .env.example showing required environment variables
6. Install package in editable mode
7. Verify imports work: `from campaign_builder import __version__`

### Acceptance Criteria

- [ ] All directories exist
- [ ] All __init__.py files present
- [ ] Package installs without errors
- [ ] Import statement succeeds
- [ ] API key can be loaded from environment

---

## Phase 2: Core Schemas

### Objectives

- Define FileGuide dataclass with all fields
- Define error types and severity levels
- Define FileType enumeration
- Implement to_markdown() and to_dict() methods

### FileType Enumeration

Create an enumeration with these values:
- LAMMPS_DATA, LAMMPS_INPUT, QE_INPUT, QE_OUTPUT
- POSCAR, CIF, XYZ, PDB
- PDF, EXCEL, CSV
- PYTHON_SCRIPT, SHELL_SCRIPT
- JSON, YAML, TEXT, UNKNOWN

### FileGuide Dataclass

Create a dataclass with fields organized in these categories:

**Required Core Fields:**
- file_path (string): Absolute path
- file_name (string): Just filename
- file_type (FileType): Detected type
- file_size_bytes (integer): Size
- sha256_hash (string): File hash
- purpose (string): What file is for
- summary (string): Key takeaways
- confidence (string): high/medium/low
- analysis_iterations (integer): Agent turns used

**LAMMPS Data Fields:**
- atom_count, atom_types, bond_count, angle_count, dihedral_count
- box_dimensions (structured)
- pair_style, pair_coeffs, bond_style, bond_coeffs, angle_style, angle_coeffs

**QE Input Fields:**
- calculation, prefix, pseudo_dir, ecutwfc, ecutrho
- species list, kpoints settings

**PDF Fields:**
- page_count, title, authors, key_findings, parameters_mentioned

**Excel/CSV Fields:**
- sheets, columns, row_count, data_preview

**Issue Fields:**
- warnings (list), missing_info (list), parse_errors (list)

### FileGuide Methods

**to_markdown():**
- Returns markdown-formatted string
- Includes all populated fields
- Formats type-specific information appropriately
- Suitable for LLM consumption

**to_dict():**
- Returns JSON-serializable dictionary
- Converts enums to string values
- Excludes None values

### Error Types

**ErrorSeverity Enumeration:**
- INFO: Continue, note for user
- WARNING: Continue, warn user
- ERROR: Skip item, continue others
- FATAL: Stop entire process

**ErrorCode Enumeration:**
- E1xx: File errors (not found, too large, unreadable)
- E2xx: Analysis errors (timeout, parse failure)
- E3xx: Validation errors (L0/L1/L2/L3 failures)
- E4xx: Campaign errors (missing params, conflicts)
- E5xx: System errors (API, timeout)

**CampaignError Dataclass:**
- code (ErrorCode)
- severity (ErrorSeverity)
- message (string)
- file_path (optional string)
- line_number (optional integer)
- details (optional dict)
- suggestion (optional string)

**CampaignError Methods:**
- to_user_message(): Format for display
- to_dict(): JSON-serializable

**ErrorHandler Class:**
- Accumulates errors and warnings
- Methods: add(), has_fatal(), has_errors(), can_continue(), get_report(), clear()

### Acceptance Criteria

- [ ] FileType enum has all values
- [ ] FileGuide can be instantiated with required fields
- [ ] FileGuide.to_markdown() produces valid markdown
- [ ] FileGuide.to_dict() produces serializable dict
- [ ] ErrorCode enum has all values
- [ ] CampaignError formats properly
- [ ] ErrorHandler accumulates and reports correctly
- [ ] All classes have proper type hints

---

## Phase 3: Custom Tools

### Objectives

- Implement read_pdf tool
- Implement read_excel tool
- Implement read_csv tool
- Implement validate_deck tool
- Implement get_structure_summary tool

### read_pdf Tool

**Purpose:** Extract text content from PDF files

**Input Parameters:**
- path (required): Path to PDF file
- pages (optional): Page range like "1-5" or "1,3,7"
- max_chars (optional, default 50000): Maximum characters

**Behavior:**
1. Open PDF file
2. Extract text from each page
3. Preserve page structure with markers
4. Truncate if exceeds max_chars (add warning)
5. Report extraction quality (high for searchable, low for scanned)
6. Handle errors gracefully

**Output:**
- page_count: Integer
- title: String or null
- text: Extracted content
- extraction_quality: high/medium/low

### read_excel Tool

**Purpose:** Read Excel spreadsheet data

**Input Parameters:**
- path (required): Path to Excel file
- sheet (optional): Sheet name or index
- max_rows (optional, default 100): Row limit

**Behavior:**
1. Open Excel file
2. Get list of all sheet names
3. Read specified sheet (or first)
4. Extract column headers
5. Format data as text table
6. Infer column types

**Output:**
- sheets: List of sheet names
- current_sheet: Which sheet was read
- columns: List of headers
- row_count: Total rows
- data: Formatted text table
- column_types: Dict of column name to type

### read_csv Tool

**Purpose:** Read CSV file data

**Input Parameters:**
- path (required): Path to CSV file
- delimiter (optional): Field separator (auto-detect)
- max_rows (optional, default 100): Row limit

**Behavior:**
1. Auto-detect delimiter if not specified
2. Read headers and data
3. Format as text table
4. Infer column types

**Output:**
- columns: List of headers
- row_count: Total rows
- data: Formatted text
- column_types: Dict
- delimiter_used: What delimiter was used

### validate_deck Tool

**Purpose:** Run L0-L3 validation on input deck

**Input Parameters:**
- path (required): Path to input deck
- engine (required): "lammps" or "qe"
- levels (optional): Which levels to run
- structure_file (optional): For context checks

**Behavior:**
1. Read file content
2. Run L0: Check for placeholder patterns
3. If L0 passes, run L1: Engine-specific syntax
4. If L1 passes, run L2: Actual engine check (if available)
5. Run L3: Physical reasonableness checks
6. Compile results

**Output:**
- overall_passed: Boolean
- l0, l1, l2, l3: Individual results (each with passed, checks, errors, warnings)
- all_issues: Combined list
- suggestions: Improvement recommendations
- can_run: Whether deck is safe to execute

### get_structure_summary Tool

**Purpose:** Smart extraction from large structure files

**Input Parameters:**
- path (required): Path to structure file
- format (optional): File format hint

**Behavior:**
1. Detect format from extension/content
2. Read header section
3. Find and extract coefficient sections
4. NEVER read atom coordinates
5. Count atoms without loading data

**Output:**
- format: Detected format
- atom_count: Integer
- atom_types: Structured list
- box: Dimensions
- coefficients: All found
- sections_found: List of sections

### Acceptance Criteria

- [ ] read_pdf extracts text from valid PDF
- [ ] read_pdf handles multi-page documents
- [ ] read_pdf truncates oversized content
- [ ] read_excel lists all sheets
- [ ] read_excel reads specified sheet
- [ ] read_csv auto-detects delimiters
- [ ] validate_deck runs L0 correctly
- [ ] validate_deck runs L1 for LAMMPS
- [ ] validate_deck runs L1 for QE
- [ ] validate_deck runs L2 when engine available
- [ ] validate_deck runs L3 checks
- [ ] get_structure_summary never reads coordinates

---

## Phase 4: Agent Prompts

### Objectives

- Write FileAnalyzer system prompt
- Write Campaign Planner system prompt
- Organize prompts in dedicated module

### FileAnalyzer System Prompt Requirements

The prompt must instruct the agent to:

1. **Check file size first** using wc -l or similar
2. **For large files (>500 lines):**
   - Read header section only (first 50-100 lines)
   - Use Grep to find specific sections
   - Read only those sections
   - NEVER read Atoms/coordinates sections
3. **For LAMMPS data files, extract:**
   - Counts (atoms, bonds, angles, etc.)
   - Box dimensions
   - Masses section with labels
   - ALL coefficient sections completely
4. **For PDFs:**
   - Use read_pdf tool
   - Identify document type
   - Extract specific parameters
   - Note methodology
5. **For Excel/CSV:**
   - Understand structure
   - Identify what data represents
   - Preview first rows
6. **Output format:**
   - Structured File Guide
   - All required fields
   - Confidence level
   - What couldn't be determined

### Campaign Planner System Prompt Requirements

The prompt must instruct the agent to:

1. **Parse user intent:**
   - Target property
   - Simulation type
   - Conditions (T, P, duration)
   - Special requirements
2. **Analyze File Guides:**
   - Role of each file
   - Available parameters
   - Conflicts between files
3. **Check for missing information:**
   - If force field parameters missing: STOP
   - If structure missing: STOP
   - Report what's needed
4. **Generate input decks:**
   - Use EXACT parameters from File Guides
   - Cite source in comments for every parameter
   - Follow engine best practices
5. **Validate before finishing:**
   - Always run validate_deck
   - Attempt repair if fails
   - Maximum 3 attempts
6. **Never invent physics:**
   - No guessing force field values
   - Explicit about defaults
   - Fail loudly on missing info

### Acceptance Criteria

- [ ] FileAnalyzer prompt covers all file types
- [ ] FileAnalyzer prompt emphasizes smart reading strategy
- [ ] FileAnalyzer prompt specifies output format
- [ ] Campaign Planner prompt covers intent parsing
- [ ] Campaign Planner prompt emphasizes provenance
- [ ] Campaign Planner prompt mandates validation
- [ ] Both prompts prohibit inventing parameters
- [ ] Prompts are clear and unambiguous

---

## Phase 5: FileAnalyzer Sub-Agent

### Objectives

- Implement file analysis function
- Implement parallel analysis of multiple files
- Handle errors gracefully
- Parse File Guide from agent output

### analyze_file Function

**Input:**
- file_path (string): Path to analyze
- max_iterations (integer, default 15): Iteration limit
- timeout (integer, default 120): Seconds

**Behavior:**
1. Pre-checks:
   - Verify file exists
   - Check file size (max 500MB)
   - Check if binary (only PDF acceptable)
2. Select tools based on file type
3. Create agent options with:
   - FileAnalyzer system prompt
   - Selected tools
   - Iteration limit
   - Working directory
4. Query agent with file path
5. Collect response
6. Parse File Guide from output
7. Return (FileGuide or None, list of errors)

**Error Handling:**
- FILE_NOT_FOUND if doesn't exist
- FILE_TOO_LARGE if >500MB
- ANALYSIS_TIMEOUT if times out
- AGENT_ERROR if agent fails

### analyze_all_files Function

**Input:**
- files (list of Path): Files to analyze
- max_iterations (integer): Limit per file

**Behavior:**
1. Create analysis task for each file
2. Run all tasks in parallel (asyncio.gather or equivalent)
3. Collect results and errors
4. Return (list of FileGuides, list of errors)

**Parallelism:**
- Each file gets its own agent session
- Failures don't block other files
- Total time ≈ slowest file, not sum

### parse_file_guide_from_text Function

**Input:**
- text (string): Agent's output
- path (Path): Original file path

**Behavior:**
1. Detect file type from extension and content
2. Create FileGuide with basic info
3. Try to extract structured data from agent output
4. Parse line counts if mentioned
5. Parse atom counts if mentioned
6. Set confidence based on extraction success

**Note:** In production, agent should output JSON directly. This parser is a fallback.

### Acceptance Criteria

- [ ] analyze_file returns FileGuide for valid file
- [ ] analyze_file handles missing files
- [ ] analyze_file handles oversized files
- [ ] analyze_file respects timeout
- [ ] analyze_all_files runs in parallel
- [ ] analyze_all_files handles partial failures
- [ ] File Guide contains extracted information
- [ ] Errors are properly structured

---

## Phase 6: Campaign Planner Agent

### Objectives

- Implement campaign planning function
- Format File Guides for agent consumption
- Handle deck generation
- Integrate validation

### run_campaign_planner Function

**Input:**
- intent (string): User's intent
- file_guides (list of FileGuide): From analysis
- workspace (Path): Output directory
- max_iterations (integer, default 10): Limit

**Behavior:**
1. Format File Guides as markdown using to_markdown()
2. Construct prompt with:
   - User intent
   - All File Guides
   - Workspace path
   - Instructions to validate
3. Create agent options with:
   - Campaign Planner system prompt
   - Write, validate_deck, Read tools
   - Iteration limit
4. Query agent
5. Collect response
6. Find generated files in workspace
7. Return result dict

**Output:**
- success (boolean)
- plan (string): Campaign plan text
- files (list of paths): Generated files
- validation (dict): Validation results
- errors (list): Any errors

### File Guide Formatting

When presenting File Guides to Campaign Planner:
- Use markdown format
- Separate each File Guide with horizontal rule
- Include all relevant fields
- Highlight any warnings or missing info

### Validation Integration

The agent should:
1. Generate deck file using Write tool
2. Call validate_deck tool immediately
3. If validation fails, analyze error
4. Attempt repair if possible
5. Re-validate
6. Maximum 3 repair attempts
7. Report if repairs fail

### Acceptance Criteria

- [ ] Function receives intent and File Guides
- [ ] Agent generates input deck file
- [ ] Agent validates generated file
- [ ] Agent attempts repair on failure
- [ ] Function returns generated file paths
- [ ] Function returns validation results
- [ ] Errors are properly captured

---

## Phase 7: Orchestration Runner

### Objectives

- Implement main pipeline function
- Coordinate file staging, analysis, planning, validation
- Handle graceful degradation
- Compile comprehensive results

### run_campaign_builder Function

**Input:**
- intent (string): User's intent
- workspace (Path): Directory with input files
- max_file_iterations (integer, default 15)
- max_plan_iterations (integer, default 10)

**Behavior:**

1. **Discover Files:**
   - List all files in workspace
   - Filter to actual files (not directories)
   - Report count found
   - If no files: FATAL error

2. **Compute Hashes:**
   - SHA256 hash for each file
   - Store for provenance

3. **Analyze Files (Parallel):**
   - Call analyze_all_files
   - Collect File Guides and errors
   - If all fail: FATAL error
   - If some fail: Continue with successful ones, report failures

4. **Run Campaign Planner:**
   - Pass intent and File Guides
   - Collect plan, files, validation

5. **Compile Results:**
   - Success status
   - File Guides
   - Campaign plan
   - Generated files
   - All errors and warnings

**Error Handling:**
- Use ErrorHandler to accumulate
- Check for fatal errors at each step
- Continue with partial information when possible
- Report what was skipped

**Output:**
- success (boolean)
- file_guides (list)
- campaign_plan (string)
- generated_files (list of paths)
- errors (list of strings)
- warnings (list of strings)

### Acceptance Criteria

- [ ] Function discovers files in workspace
- [ ] Function analyzes all files
- [ ] Function handles partial analysis failures
- [ ] Function runs campaign planner
- [ ] Function compiles comprehensive results
- [ ] Errors are accumulated and reported
- [ ] Success is False if errors occurred

---

## Phase 8: Command-Line Interface

### Objectives

- Implement CLI entry point
- Parse command-line arguments
- Display results appropriately
- Set proper exit codes

### CLI Command Specification

**Command Name:** campaign-builder

**Arguments:**
- INTENT (required): Natural language intent string

**Options:**
- --workspace / -w (required): Path to directory with input files
- --max-iterations / -n (default 10): Max planning iterations
- --output / -o (optional): Output directory (defaults to workspace)
- --verbose / -v: Enable verbose output

### CLI Behavior

1. **Initialization:**
   - Load environment variables from .env
   - Validate workspace exists and is directory
   - Validate output directory exists or create it

2. **Display:**
   - Show intent
   - Show workspace path
   - Show output path

3. **Execution:**
   - Call run_campaign_builder
   - Display progress (file count, analysis status)

4. **Results Display:**
   - If success: Green "Campaign built successfully!"
   - List generated files
   - If verbose: Show full campaign plan
   - If errors: Red error messages
   - If warnings: Yellow warnings

5. **Exit Codes:**
   - 0: Success
   - 1: Failure

### Acceptance Criteria

- [ ] CLI parses arguments correctly
- [ ] CLI validates workspace exists
- [ ] CLI calls main function
- [ ] CLI displays success/failure appropriately
- [ ] CLI shows generated files
- [ ] CLI exits with proper code

---

## Phase 9: Validation Pipeline

### Objectives

- Implement L0 validation
- Implement L1 validation for LAMMPS
- Implement L1 validation for QE
- Implement L2 validation
- Implement L3 validation

### L0: Template Completeness

**What to Check:**
- Handlebars: {{...}}
- Shell variables: ${...}
- Angle brackets: <...> (when looks like placeholder)
- Explicit markers: [TODO], [PLACEHOLDER], [FILL], FIXME, XXX, TBD, ???
- Underscore fills: _____

**Implementation:**
1. Define list of regex patterns
2. Search content for each pattern
3. Collect all matches with line numbers
4. Return pass/fail and list of found placeholders

### L1: LAMMPS Syntax Validation

**Required Commands:**
- units (must be present)
- atom_style (must be present)
- boundary (must be present)

**Command Order:**
- pair_style before pair_coeff
- read_data before commands using atoms
- variables defined before use

**Completeness:**
- All atom type pairs have pair_coeff
- Bond/angle coeffs if topology exists

**Syntax Checks:**
- Fix commands have required args
- Compute commands properly formed
- Dump commands have valid format

### L1: QE Syntax Validation

**Required Namelists:**
- &CONTROL (must be present)
- &SYSTEM (must be present)
- &ELECTRONS (must be present)

**Namelist Syntax:**
- Every & has matching /
- No duplicate parameter names

**Required Cards:**
- ATOMIC_SPECIES present
- ATOMIC_POSITIONS present
- K_POINTS present

**Consistency:**
- nat matches ATOMIC_POSITIONS count
- ntyp matches ATOMIC_SPECIES count
- All position species in species card

**Completeness:**
- ecutwfc defined
- Cell defined (ibrav+celldm or CELL_PARAMETERS)

### L2: Engine Acceptance

**LAMMPS:**
1. Find LAMMPS executable (lmp, lammps)
2. Run with input file and minimal options
3. Capture stdout and stderr
4. Check return code
5. Parse error messages
6. Timeout after 30 seconds

**QE:**
1. Find pw.x executable
2. Run with input file
3. Capture output
4. Check for error messages
5. Kill before SCF starts
6. Timeout after 60 seconds

**When Engine Unavailable:**
- Skip L2 with clear warning
- Report that L2 was not performed
- Recommend testing before production

### L3: Physical Reasonableness

**Universal Checks:**
- Temperature: 0 < T < 10000 K (warning outside)
- Cutoff: < half minimum box dimension (error if larger)
- Density: within reasonable range (warning if extreme)

**LAMMPS Checks:**
- Thermostat damping reasonable for units
- Barostat coupling reasonable
- Output frequency reasonable
- Run length appropriate

**QE Checks:**
- ecutrho/ecutwfc ratio appropriate for PP type
- K-point density sufficient
- Smearing width appropriate

**Property-Specific:**
- Diffusion: MSD compute present, appropriate ensemble
- Equilibration: Temperature control active, sufficient duration

### Acceptance Criteria

- [ ] L0 detects all placeholder patterns
- [ ] L1 validates LAMMPS required commands
- [ ] L1 validates LAMMPS command order
- [ ] L1 validates QE required namelists
- [ ] L1 validates QE consistency
- [ ] L2 runs LAMMPS when available
- [ ] L2 runs QE when available
- [ ] L2 handles missing engine gracefully
- [ ] L3 checks physical parameters
- [ ] L3 provides appropriate warnings

---

## Phase 10: Testing Strategy

### Unit Tests

**Schema Tests:**
- FileGuide instantiation
- FileGuide.to_markdown() format
- FileGuide.to_dict() serialization
- ErrorHandler accumulation
- CampaignError formatting

**Tool Tests:**
- read_pdf with valid PDF
- read_pdf with corrupted PDF
- read_excel with valid file
- read_csv with various delimiters
- validate_deck L0 with placeholders
- validate_deck L0 without placeholders
- validate_deck L1 for LAMMPS
- validate_deck L1 for QE

**Validation Tests:**
- L0 with each placeholder type
- L1 LAMMPS missing commands
- L1 LAMMPS wrong order
- L1 QE missing namelists
- L1 QE count mismatch
- L3 unreasonable parameters

### Integration Tests

**File Analysis:**
- Analyze sample LAMMPS data file
- Analyze sample QE input file
- Analyze sample PDF
- Analyze sample Excel

**Campaign Planning:**
- Simple equilibration intent
- Diffusion calculation intent
- Missing parameters behavior

**Full Pipeline:**
- End-to-end with valid inputs
- End-to-end with partial failures
- End-to-end with invalid inputs

### Test Fixtures

Create test files:
- sample.data: Small LAMMPS data file with all sections
- sample.in: Valid LAMMPS input script
- sample.pwi: Valid QE input file
- sample.pdf: PDF with extractable text
- broken.in: Invalid LAMMPS input (for validation tests)

### Acceptance Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Test coverage >80%
- [ ] Fixtures are realistic but small

---

## Development Milestones

### Milestone 1: Foundation

**Goal:** Working project with imports

**Tasks:**
- Create project structure
- Configure dependencies
- Verify installation

**Test:** `from campaign_builder import __version__` works

### Milestone 2: Schemas

**Goal:** All data types defined

**Tasks:**
- Implement FileType enum
- Implement FileGuide dataclass
- Implement error types
- Write schema tests

**Test:** All schema unit tests pass

### Milestone 3: Tools

**Goal:** All custom tools working

**Tasks:**
- Implement read_pdf
- Implement read_excel
- Implement validate_deck
- Write tool tests

**Test:** All tool unit tests pass

### Milestone 4: FileAnalyzer

**Goal:** Can analyze single file

**Tasks:**
- Write FileAnalyzer prompt
- Implement analyze_file
- Test with sample files

**Test:** FileGuide returned for valid file

### Milestone 5: Campaign Planner

**Goal:** Can generate deck from File Guides

**Tasks:**
- Write Campaign Planner prompt
- Implement run_campaign_planner
- Test with sample File Guides

**Test:** Deck generated and validated

### Milestone 6: Full Pipeline

**Goal:** End-to-end working

**Tasks:**
- Implement run_campaign_builder
- Implement CLI
- Test full flow

**Test:** CLI produces valid deck from workspace

### Milestone 7: Validation

**Goal:** All validation levels working

**Tasks:**
- Complete L0-L3 implementation
- Integrate with pipeline
- Test validation edge cases

**Test:** Validation catches known issues

### Milestone 8: Polish

**Goal:** Production ready

**Tasks:**
- Error message quality
- Documentation
- Test coverage
- Performance optimization

**Test:** All acceptance criteria met
