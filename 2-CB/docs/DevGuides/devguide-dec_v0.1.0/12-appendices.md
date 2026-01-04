# Appendices

This file contains reference materials, file listings, and implementation checklists.

---

## Appendix A: Complete File Listing

### A.1 Source Files to Create

This is the complete list of source files that must be created during implementation:

```
campaign_builder/
├── __init__.py                     # Package init, version, public API exports
├── __main__.py                     # CLI entry point for `python -m campaign_builder`
├── cli.py                          # Command-line interface implementation
│
├── schemas/
│   ├── __init__.py                 # Schema exports
│   ├── file_types.py               # FileType enum and detection
│   ├── file_guide.py               # FileGuide dataclass
│   ├── box_dimensions.py           # BoxDimensions dataclass
│   ├── errors.py                   # ErrorCode enum, CampaignError dataclass
│   └── campaign_result.py          # CampaignResult dataclass
│
├── tools/
│   ├── __init__.py                 # Tool exports
│   ├── documents/
│   │   ├── __init__.py             # Document tool exports
│   │   ├── pdf_reader.py           # PDF reading with PyMuPDF
│   │   ├── excel_reader.py         # Excel reading with openpyxl
│   │   └── csv_reader.py           # CSV reading
│   │
│   └── validation/
│       ├── __init__.py             # Validation tool exports
│       ├── l0_templates.py         # L0 placeholder detection
│       ├── l1_lammps.py            # L1 LAMMPS syntax validation
│       ├── l1_qe.py                # L1 QE syntax validation
│       ├── l2_engine.py            # L2 engine acceptance testing
│       ├── l3_physics.py           # L3 physics sanity checks
│       └── validator.py            # Unified validation interface
│
├── agent/
│   ├── __init__.py                 # Agent exports
│   ├── prompts.py                  # System prompts for agents
│   ├── file_analyzer.py            # FileAnalyzer agent implementation
│   ├── campaign_planner.py         # Campaign Planner agent implementation
│   └── orchestrator.py             # Main orchestration logic
│
└── utils/
    ├── __init__.py                 # Utility exports
    ├── file_hash.py                # SHA256 hash computation
    ├── file_size.py                # File size utilities
    └── logging.py                  # Logging configuration
```

### A.2 Test Files to Create

```
tests/
├── conftest.py                     # Shared pytest fixtures
├── fixtures/                       # Test data files
│   ├── lammps/
│   │   ├── simple.data             # Simple LAMMPS data file (20 atoms)
│   │   ├── large.data              # Large LAMMPS data file header
│   │   ├── input.in                # Valid LAMMPS input script
│   │   ├── with_coeffs.data        # Data file with all coefficients
│   │   └── triclinic.data          # Triclinic box example
│   ├── qe/
│   │   ├── scf.pwi                 # QE SCF input
│   │   ├── relax.pwi               # QE relaxation input
│   │   └── vc-relax.pwi            # QE variable-cell relaxation
│   ├── documents/
│   │   ├── paper.pdf               # Sample research paper (optional)
│   │   └── params.xlsx             # Parameter spreadsheet
│   └── invalid/
│       ├── syntax_error.in         # LAMMPS file with syntax error
│       ├── missing_coeffs.data     # Data file without pair coeffs
│       └── placeholder.in          # File with XXX placeholders
│
├── test_schemas.py                 # Schema unit tests
├── test_tools_documents.py         # Document tool tests
├── test_tools_validation.py        # Validation tool tests
├── test_file_analyzer.py           # FileAnalyzer tests
├── test_campaign_planner.py        # Campaign Planner tests
├── test_orchestration.py           # Orchestration tests
├── test_cli.py                     # CLI tests
│
└── integration/
    ├── workspaces/                 # Integration test workspaces
    │   ├── mof_system/
    │   ├── polymer_melt/
    │   └── dft_silicon/
    ├── test_full_workflow.py       # End-to-end workflow tests
    ├── test_error_recovery.py      # Error handling tests
    └── test_performance.py         # Performance tests
```

### A.3 Documentation Files

```
docs/
├── DevGuides/
│   └── devguide-dec_v0.1.0/
│       ├── 00-index.md             # Master index
│       ├── 01-overview.md          # Architecture overview
│       ├── 02-foundation.md        # Project foundation
│       ├── 03-schemas.md           # Core schemas
│       ├── 04-tools-documents.md   # Document tools
│       ├── 05-tools-validation.md  # Validation tools
│       ├── 06-prompts.md           # Agent prompts
│       ├── 07-file-analyzer.md     # FileAnalyzer agent
│       ├── 08-campaign-planner.md  # Campaign Planner
│       ├── 09-orchestration.md     # Orchestration
│       ├── 10-cli.md               # CLI implementation
│       ├── 11-testing.md           # Testing
│       └── 12-appendices.md        # This file
```

---

## Appendix B: Implementation Checklists

### B.1 Phase 1: Foundation (Thrusts 1-3)

**Thrust 1: Project Setup**
- [ ] Create `pyproject.toml` with all dependencies
- [ ] Create directory structure
- [ ] Create `__init__.py` files
- [ ] Set up logging configuration
- [ ] Verify `pip install -e .` works

**Thrust 2: FileType Enum**
- [ ] Define FileType enum with all values
- [ ] Implement `detect_file_type()` function
- [ ] Handle edge cases (POSCAR, CONTCAR by name)
- [ ] Add unit tests for detection

**Thrust 3: FileGuide Dataclass**
- [ ] Define FileGuide with all required fields
- [ ] Define BoxDimensions nested dataclass
- [ ] Implement `to_dict()` method
- [ ] Implement `from_dict()` classmethod
- [ ] Add validation in `__post_init__`
- [ ] Add unit tests for serialization

### B.2 Phase 2: Tools (Thrusts 4-8)

**Thrust 4: PDF Reader**
- [ ] Install PyMuPDF dependency
- [ ] Implement `read_pdf()` function
- [ ] Handle extraction errors gracefully
- [ ] Return structured PDFResult
- [ ] Add unit tests

**Thrust 5: Excel/CSV Reader**
- [ ] Install openpyxl dependency
- [ ] Implement `read_excel()` function
- [ ] Implement `read_csv()` function
- [ ] Handle multi-sheet Excel files
- [ ] Add unit tests

**Thrust 6: L0 Validation**
- [ ] Define placeholder patterns (XXX, TODO, etc.)
- [ ] Implement `validate_l0()` function
- [ ] Return locations of all placeholders
- [ ] Add unit tests

**Thrust 7: L1 Validation**
- [ ] Implement `validate_l1_lammps()`
- [ ] Implement `validate_l1_qe()`
- [ ] Check required commands/namelists
- [ ] Check command ordering
- [ ] Add unit tests

**Thrust 8: L2 Validation**
- [ ] Configure engine paths from environment
- [ ] Implement `validate_l2()` function
- [ ] Run engine in check/parse-only mode
- [ ] Capture and parse engine output
- [ ] Handle engine not available gracefully
- [ ] Add unit tests (with mocks)

### B.3 Phase 3: Prompts (Thrusts 9-10)

**Thrust 9: FileAnalyzer Prompt**
- [ ] Write core identity section
- [ ] Write file size strategy
- [ ] Write LAMMPS data file strategy
- [ ] Write LAMMPS input script strategy
- [ ] Write QE input strategy
- [ ] Write PDF/Excel/CSV strategies
- [ ] Write output format section
- [ ] Write never-do rules
- [ ] Test prompt manually

**Thrust 10: Campaign Planner Prompt**
- [ ] Write identity and tools section
- [ ] Write intent parsing section
- [ ] Write File Guide analysis section
- [ ] Write missing info handling
- [ ] Write generation rules
- [ ] Write validation integration
- [ ] Write never-invent rules
- [ ] Write output format section
- [ ] Test prompt manually

### B.4 Phase 4: Agents (Thrusts 11-14)

**Thrust 11: FileAnalyzer Core**
- [ ] Define AnalysisResult dataclass
- [ ] Implement `pre_check_file()` function
- [ ] Implement `get_file_analyzer_tools()` function
- [ ] Implement `analyze_file()` function
- [ ] Implement response parser
- [ ] Add logging
- [ ] Add unit tests

**Thrust 12: Parallel Analysis**
- [ ] Define BatchAnalysisResult dataclass
- [ ] Implement `analyze_all_files()` function
- [ ] Implement `discover_files()` function
- [ ] Add semaphore for concurrency limit
- [ ] Add progress callback support
- [ ] Add unit tests

**Thrust 13: Campaign Planner Core**
- [ ] Define CampaignResult dataclass
- [ ] Implement `plan_campaign()` function
- [ ] Implement intent parsing
- [ ] Implement deck generation
- [ ] Implement parameter manifest generation
- [ ] Add unit tests

**Thrust 14: Validation Integration**
- [ ] Implement validation after generation
- [ ] Implement repair loop
- [ ] Track repair attempts
- [ ] Handle unfixable errors
- [ ] Add unit tests

### B.5 Phase 5: Orchestration (Thrusts 15-16)

**Thrust 15: Main Pipeline**
- [ ] Implement `CampaignBuilder` class
- [ ] Implement `analyze()` method
- [ ] Implement `generate()` method
- [ ] Wire analysis to planning
- [ ] Add logging
- [ ] Add unit tests

**Thrust 16: Error Handling**
- [ ] Implement error aggregation
- [ ] Implement graceful degradation
- [ ] Add detailed error reporting
- [ ] Generate summary reports
- [ ] Add unit tests

### B.6 Phase 6: CLI (Thrust 17)

**Thrust 17: CLI Implementation**
- [ ] Create argument parser
- [ ] Implement `analyze` subcommand
- [ ] Implement `generate` subcommand
- [ ] Implement `validate` subcommand
- [ ] Add progress display
- [ ] Add JSON output mode
- [ ] Configure logging from flags
- [ ] Add console script entry point
- [ ] Add unit tests

### B.7 Phase 7: Testing (Thrusts 18-19)

**Thrust 18: Unit Tests**
- [ ] Set up test infrastructure
- [ ] Create test fixtures
- [ ] Complete schema tests
- [ ] Complete validation tests
- [ ] Complete document tool tests
- [ ] Complete analyzer tests
- [ ] Complete CLI tests
- [ ] Achieve >80% coverage

**Thrust 19: Integration Tests**
- [ ] Create test workspaces
- [ ] Implement workflow tests
- [ ] Implement error recovery tests
- [ ] Implement performance tests
- [ ] Add regression tests

---

## Appendix C: Error Code Reference

### C.1 File Errors (E1xx)

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| E101 | FILE_NOT_FOUND | File does not exist | ERROR |
| E102 | FILE_TOO_LARGE | File exceeds 500MB limit | ERROR |
| E103 | FILE_UNREADABLE | Cannot read file (permissions) | ERROR |
| E104 | FILE_ENCODING_ERROR | Cannot decode file content | ERROR |
| E105 | FILE_EMPTY | File has no content | WARNING |
| E106 | BINARY_UNSUPPORTED | Binary file not supported | WARNING |

### C.2 Agent Errors (E2xx)

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| E201 | AGENT_TIMEOUT | Agent exceeded timeout | ERROR |
| E202 | AGENT_MAX_ITERATIONS | Agent hit iteration limit | WARNING |
| E203 | AGENT_PARSE_FAILED | Could not parse agent output | ERROR |
| E204 | AGENT_INCOMPLETE | Agent output missing fields | WARNING |
| E205 | AGENT_ERROR | General agent error | FATAL |

### C.3 Validation Errors (E3xx)

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| E301 | PLACEHOLDER_FOUND | Unresolved placeholder in output | ERROR |
| E302 | SYNTAX_INVALID | Syntax error in generated file | ERROR |
| E303 | ENGINE_REJECTED | Engine rejected input | ERROR |
| E304 | PHYSICS_WARNING | Physics sanity check warning | WARNING |
| E305 | REPAIR_FAILED | Could not fix validation error | ERROR |

### C.4 Data Errors (E4xx)

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| E401 | MISSING_FORCE_FIELD | No force field parameters found | FATAL |
| E402 | MISSING_STRUCTURE | No structure information found | FATAL |
| E403 | INCOMPLETE_COEFFICIENTS | Some pair_coeffs missing | ERROR |
| E404 | UNIT_MISMATCH | Inconsistent units detected | ERROR |
| E405 | PARAMETER_CONFLICT | Conflicting parameter values | WARNING |

---

## Appendix D: Execution Environment

### D.1 System Paths

**LAMMPS Binary:**
```
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp
```

**Quantum ESPRESSO (CPU):**
```
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x
```

### D.2 Environment Variables

Set these for validation to work:

```bash
export LAMMPS_PATH="/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp"
export QE_PATH="/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x"
export CAMPAIGN_BUILDER_LOG_LEVEL="INFO"
```

### D.3 LAMMPS Validation Command

```bash
# Parse-only check (no actual simulation)
$LAMMPS_PATH -in input.in -log none -screen none -echo none 2>&1
```

### D.4 QE Validation Command

```bash
# Check input syntax
$QE_PATH -in input.pwi -nk 1 -check_input 2>&1
```

---

## Appendix E: FileGuide Schema Reference

### E.1 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| file_path | str | Absolute path to file |
| file_name | str | File name only |
| file_type | FileType | Detected file type enum |
| file_size_bytes | int | Size in bytes |
| sha256_hash | str | SHA256 hash of content |
| purpose | str | One-line description of file role |
| summary | str | Paragraph summary of contents |
| confidence | str | "high", "medium", or "low" |
| analysis_iterations | int | Iterations used for analysis |

### E.2 Optional Fields (Common)

| Field | Type | Description |
|-------|------|-------------|
| line_count | int | Number of lines |
| warnings | List[str] | Non-fatal issues |
| missing_info | List[str] | What couldn't be determined |
| parse_errors | List[str] | Parsing errors encountered |

### E.3 LAMMPS-Specific Fields

| Field | Type | Description |
|-------|------|-------------|
| atom_count | int | Number of atoms |
| bond_count | int | Number of bonds |
| angle_count | int | Number of angles |
| dihedral_count | int | Number of dihedrals |
| atom_type_count | int | Number of atom types |
| box_dimensions | BoxDimensions | Simulation box info |
| atom_types | List[dict] | Type ID, mass, label |
| pair_coefficients | List[dict] | Pair interaction params |
| bond_coefficients | List[dict] | Bond params |
| angle_coefficients | List[dict] | Angle params |
| dihedral_coefficients | List[dict] | Dihedral params |
| pair_style | str | e.g., "lj/cut/coul/long" |
| atom_style | str | e.g., "full", "molecular" |
| units | str | e.g., "real", "metal" |

### E.4 QE-Specific Fields

| Field | Type | Description |
|-------|------|-------------|
| calculation_type | str | "scf", "relax", etc. |
| nat | int | Number of atoms |
| ntyp | int | Number of species |
| ecutwfc | float | Wavefunction cutoff (Ry) |
| ecutrho | float | Density cutoff (Ry) |
| ibrav | int | Bravais lattice type |
| atomic_species | List[dict] | Species with pseudopotentials |
| k_points | dict | K-point grid info |
| cell_parameters | List[List[float]] | Unit cell vectors |

---

## Appendix F: Quick Reference Card

### F.1 Common CLI Commands

```bash
# Analyze a workspace
campaign-builder analyze ./my_workspace

# Generate with intent
campaign-builder generate ./workspace "equilibrate at 300K for 1ns"

# Validate a file
campaign-builder validate input.in --level all

# JSON output
campaign-builder analyze ./workspace --json > guides.json

# Verbose mode
campaign-builder -vvv generate ./workspace "run NPT"
```

### F.2 Python API

```python
from campaign_builder import CampaignBuilder

# Create builder
builder = CampaignBuilder()

# Analyze workspace
result = await builder.analyze("./workspace")

# Access File Guides
for fg in result.file_guides:
    print(f"{fg.file_name}: {fg.purpose}")

# Generate campaign
campaign = await builder.generate(
    file_guides=result.file_guides,
    intent="equilibrate at 300K"
)

# Check results
print(f"Success: {campaign.success}")
for f in campaign.generated_files:
    print(f"  {f.filename}: {f.validation_result}")
```

### F.3 Testing Commands

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=campaign_builder --cov-report=term-missing

# Run only unit tests
pytest tests/ -v -m "not integration"

# Run only fast tests
pytest tests/ -v -m "not slow"
```

---

## Appendix G: Dependency Versions

### G.1 Core Dependencies

| Package | Minimum Version | Purpose |
|---------|-----------------|---------|
| python | 3.10 | Language runtime |
| claude-agent-sdk | 0.1.0 | Agent framework |
| pydantic | 2.0 | Data validation |
| httpx | 0.24.0 | HTTP client |

### G.2 Tool Dependencies

| Package | Minimum Version | Purpose |
|---------|-----------------|---------|
| pymupdf | 1.23.0 | PDF reading |
| openpyxl | 3.1.0 | Excel reading |
| pandas | 2.0 | CSV reading (optional) |

### G.3 Development Dependencies

| Package | Minimum Version | Purpose |
|---------|-----------------|---------|
| pytest | 7.0 | Testing |
| pytest-asyncio | 0.21 | Async test support |
| pytest-cov | 4.0 | Coverage |
| ruff | 0.1.0 | Linting |
| mypy | 1.0 | Type checking |

---

## Appendix H: Glossary

| Term | Definition |
|------|------------|
| **Campaign** | A complete simulation workflow from setup to analysis |
| **Deck** | A complete set of simulation input files |
| **File Guide** | Structured summary of a file's contents (~50 lines from 500K line file) |
| **FileAnalyzer** | Sub-agent that analyzes a single file |
| **Campaign Planner** | Agent that generates validated input decks |
| **L0 Validation** | Template completeness (no placeholders) |
| **L1 Validation** | Syntax correctness check |
| **L2 Validation** | Engine acceptance (parse-only run) |
| **L3 Validation** | Physics sanity checks |
| **Graceful Degradation** | Continue with available info when some files fail |
| **Never Invent Physics** | Force field parameters must come from files |
| **Thrust** | A self-contained implementation unit |

---

## End of DevGuide

This completes the Campaign Builder DevGuide v0.1.0.

**Total Thrusts:** 19
**Total Files to Create:** ~45 source files, ~20 test files

**Implementation Order:**
1. Foundation (Thrusts 1-3)
2. Tools (Thrusts 4-8)
3. Prompts (Thrusts 9-10)
4. FileAnalyzer (Thrusts 11-12)
5. Campaign Planner (Thrusts 13-14)
6. Orchestration (Thrusts 15-16)
7. CLI (Thrust 17)
8. Testing (Thrusts 18-19)

Each thrust is designed to be implementable by an independent subagent with clear inputs, outputs, and verification criteria.
