# Overview - Campaign Builder Architecture

## Current State

**Status:** Green Field - No code exists yet.

The repository contains only documentation in `/docs/greenfield/`:
- Complete architectural specifications
- FileGuide schema definitions
- Validation framework design
- Agent prompt templates
- Domain background (computational chemistry)
- Implementation guide with phases

**What exists:**
- Documentation describing exactly what to build
- DevGuide system for tracking implementation
- Clear specifications for every component

**What doesn't exist:**
- Any Python code
- Any tests
- Any working functionality

---

## Target State

A fully functional Campaign Builder CLI that:

1. **Accepts Input:**
   - Natural language intent (e.g., "Equilibrate MOF at 300K for 1ns")
   - Workspace directory containing user files
   - Optional configuration flags

2. **Analyzes Files:**
   - Spawns FileAnalyzer sub-agents in parallel
   - Each sub-agent produces a compact FileGuide
   - Handles LAMMPS .data, LAMMPS .in, QE .pwi, PDF, Excel, CSV
   - Extracts all force field parameters
   - Never reads raw atom coordinates

3. **Plans Campaign:**
   - Parses user intent
   - Analyzes all FileGuides
   - Identifies what's available vs. missing
   - Designs simulation workflow

4. **Generates Decks:**
   - Creates complete, syntactically correct input files
   - Cites source for every parameter
   - Follows engine best practices

5. **Validates Output:**
   - L0: No placeholders remain
   - L1: Correct syntax for engine
   - L2: Engine binary accepts file (if available)
   - L3: Physically reasonable settings

6. **Delivers Package:**
   - Ready-to-run input files
   - Parameter manifest with provenance
   - Validation report
   - Campaign README

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INPUT                               │
│  Intent: "Equilibrate MOF at 300K"                          │
│  Files: structure.data, params.xlsx, reference.pdf          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ORCHESTRATION RUNNER                       │
│                    (agent/runner.py)                         │
│  - Discovers files in workspace                              │
│  - Computes file hashes for provenance                       │
│  - Spawns FileAnalyzers in parallel                          │
│  - Collects FileGuides                                       │
│  - Invokes Campaign Planner                                  │
│  - Compiles final results                                    │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│  FileAnalyzer #1  │ │  FileAnalyzer #2  │ │  FileAnalyzer #3  │
│  (structure.data) │ │  (params.xlsx)    │ │  (reference.pdf)  │
│                   │ │                   │ │                   │
│  Tools:           │ │  Tools:           │ │  Tools:           │
│  - Read           │ │  - read_excel     │ │  - read_pdf       │
│  - Grep           │ │  - Read           │ │  - Read           │
│  - Bash           │ │                   │ │                   │
│                   │ │                   │ │                   │
│  Output:          │ │  Output:          │ │  Output:          │
│  FileGuide        │ │  FileGuide        │ │  FileGuide        │
└───────────────────┘ └───────────────────┘ └───────────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CAMPAIGN PLANNER                          │
│                (agent/campaign_planner.py)                   │
│                                                              │
│  Input: User intent + List of FileGuides                     │
│                                                              │
│  Process:                                                    │
│  1. Parse intent → simulation requirements                   │
│  2. Analyze FileGuides → available information               │
│  3. Check for missing critical info → STOP if missing        │
│  4. Design campaign structure                                │
│  5. Generate input decks with provenance                     │
│  6. Validate through L0-L3                                   │
│  7. Repair if validation fails (max 3 attempts)              │
│                                                              │
│  Tools:                                                      │
│  - Write                                                     │
│  - validate_deck                                             │
│                                                              │
│  Output: Generated files + validation results                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VALIDATION PIPELINE                       │
│                   (tools/validation.py)                      │
│                                                              │
│  L0: Template Completeness                                   │
│      - Scan for {{...}}, ${...}, TODO, FIXME, ???            │
│      - BLOCKING: Must pass to continue                       │
│                                                              │
│  L1: Syntax Validation                                       │
│      - LAMMPS: units, atom_style, boundary required          │
│      - LAMMPS: pair_style before pair_coeff                  │
│      - QE: &CONTROL, &SYSTEM, &ELECTRONS required            │
│      - QE: nat matches ATOMIC_POSITIONS count                │
│      - BLOCKING: Must pass to continue                       │
│                                                              │
│  L2: Engine Acceptance                                       │
│      - Run actual LAMMPS/QE in check mode                    │
│      - Capture and analyze error messages                    │
│      - Skip if engine binary unavailable                     │
│      - BLOCKING: Must pass (if available)                    │
│                                                              │
│  L3: Physical Reasonableness                                 │
│      - Temperature range (0-10000 K)                         │
│      - Cutoff < half box dimension                           │
│      - Timestep appropriate for system                       │
│      - NON-BLOCKING: Warnings only                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      OUTPUT PACKAGE                          │
│                                                              │
│  campaign_output/                                            │
│  ├── in.minimize           # Generated LAMMPS input          │
│  ├── in.equilibrate        # Generated LAMMPS input          │
│  ├── manifest.json         # Parameter provenance            │
│  ├── validation_report.md  # L0-L3 results                   │
│  └── README.md             # Campaign documentation          │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: FileGuide

The FileGuide is the central contract between agents. It transforms large files into compact summaries.

```
┌────────────────────────────────────────────────────────────┐
│                    ORIGINAL FILE                            │
│                  mof_structure.data                         │
│                    523,847 lines                            │
│                                                             │
│  Header:                                                    │
│    523747 atoms, 15 atom types, box dimensions...           │
│                                                             │
│  Masses:                                                    │
│    1 12.011  # C_mof                                        │
│    2 15.999  # O_mof                                        │
│    ... (15 types)                                           │
│                                                             │
│  Pair Coeffs:                                               │
│    1 0.0556 3.431  # C_mof LJ                               │
│    2 0.0630 3.118  # O_mof LJ                               │
│    ... (15 coefficients)                                    │
│                                                             │
│  Atoms:                                                     │
│    1 1 1 0.0 0.0 0.0 1.234                                  │
│    2 1 2 -0.5 1.1 2.2 3.456                                 │
│    ... (523,747 lines of coordinates - NEVER READ)          │
│                                                             │
└────────────────────────────────────────────────────────────┘
                              │
                              │ FileAnalyzer processes
                              │ (reads header, greps for sections)
                              ▼
┌────────────────────────────────────────────────────────────┐
│                       FILE GUIDE                            │
│                      (~50 lines)                            │
│                                                             │
│  file_path: /workspace/mof_structure.data                   │
│  file_type: LAMMPS_DATA                                     │
│  file_size_bytes: 45234567                                  │
│  sha256_hash: abc123...                                     │
│                                                             │
│  atom_count: 523747                                         │
│  atom_types_count: 15                                       │
│  atom_types:                                                │
│    - id: 1, mass: 12.011, label: "C_mof"                    │
│    - id: 2, mass: 15.999, label: "O_mof"                    │
│    ... (all 15 types)                                       │
│                                                             │
│  box_dimensions:                                            │
│    xlo: 0.0, xhi: 45.2, lx: 45.2                            │
│    ylo: 0.0, yhi: 45.2, ly: 45.2                            │
│    zlo: 0.0, zhi: 45.2, lz: 45.2                            │
│                                                             │
│  pair_style: lj/cut/coul/long                               │
│  pair_coeffs:                                               │
│    - type1: 1, type2: 1, params: [0.0556, 3.431]            │
│    - type1: 2, type2: 2, params: [0.0630, 3.118]            │
│    ... (all coefficients)                                   │
│                                                             │
│  confidence: high                                           │
│  analysis_iterations: 5                                     │
│  warnings: []                                               │
│  missing_info: ["dihedral_coeffs"]                          │
└────────────────────────────────────────────────────────────┘
                              │
                              │ to_markdown()
                              ▼
┌────────────────────────────────────────────────────────────┐
│              MARKDOWN FOR LLM CONSUMPTION                   │
│                                                             │
│  ## File Guide: mof_structure.data                          │
│                                                             │
│  **Type:** LAMMPS_DATA                                      │
│  **Size:** 45.2 MB                                          │
│  **Confidence:** high                                       │
│                                                             │
│  ### Structure                                              │
│  - Atoms: 523,747 (15 types)                                │
│  - Box: 45.2 x 45.2 x 45.2 Angstroms                        │
│                                                             │
│  ### Atom Types                                             │
│  | ID | Mass | Label |                                      │
│  |----|------|-------|                                      │
│  | 1  | 12.011 | C_mof |                                    │
│  | 2  | 15.999 | O_mof |                                    │
│                                                             │
│  ### Force Field                                            │
│  **Pair Style:** lj/cut/coul/long                           │
│  | Type | Epsilon | Sigma |                                 │
│  |------|---------|-------|                                 │
│  | 1-1  | 0.0556  | 3.431 |                                 │
│  | 2-2  | 0.0630  | 3.118 |                                 │
│                                                             │
│  ### Missing Information                                    │
│  - dihedral_coeffs                                          │
└────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

| Module | Location | Responsibility |
|--------|----------|----------------|
| **cli.py** | campaign_builder/ | Command-line entry point, argument parsing |
| **runner.py** | campaign_builder/agent/ | Main orchestration, parallel file analysis |
| **file_analyzer.py** | campaign_builder/agent/ | FileAnalyzer sub-agent logic |
| **campaign_planner.py** | campaign_builder/agent/ | Campaign planning and deck generation |
| **prompts.py** | campaign_builder/agent/ | All system prompts for agents |
| **documents.py** | campaign_builder/tools/ | read_pdf, read_excel, read_csv tools |
| **validation.py** | campaign_builder/tools/ | L0-L3 validation logic |
| **file_guide.py** | campaign_builder/schemas/ | FileGuide dataclass, FileType enum |
| **errors.py** | campaign_builder/schemas/ | Error types, ErrorHandler, severity |
| **hashing.py** | campaign_builder/utils/ | SHA256 file hashing for provenance |

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Core Language | Python 3.10+ | Runtime |
| Agent Framework | claude-agent-sdk | Multi-agent orchestration |
| CLI Framework | Click | Command-line interface |
| PDF Reading | PyMuPDF (fitz) | Text extraction from PDFs |
| Excel Reading | openpyxl, pandas | Spreadsheet parsing |
| Configuration | python-dotenv | Environment variables |
| Testing | pytest, pytest-asyncio | Test framework |
| Linting | ruff | Code quality |

---

## Critical Constraints

### Never Invent Physics
Force field parameters (epsilon, sigma, coefficients) must come from user-provided files. If not found:
- Report exactly what's missing
- Explain why it's needed
- STOP - do not proceed with fabricated values

### FileGuide Size Limits
FileGuides must be compact enough that 5-10 fit in context with room for reasoning:
- Target: ~50 lines per FileGuide
- Maximum: 200 lines
- Never include raw coordinates

### Validation is Mandatory
Every generated file MUST pass validation before delivery:
- L0 and L1 are blocking
- L2 is blocking if engine available
- L3 produces warnings (non-blocking)

### Graceful Degradation
If some files fail analysis:
- Continue with successful ones
- Report failures clearly
- Let Campaign Planner work with available data

---

## Implementation Phases Summary

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 1 | Foundation | Working package structure |
| 2 | Schemas | FileGuide, errors, types |
| 3 | Tools | PDF, Excel, validation |
| 4 | Prompts | Agent system prompts |
| 5 | FileAnalyzer | File analysis agent |
| 6 | Campaign Planner | Deck generation agent |
| 7 | Orchestration | Full pipeline coordination |
| 8 | CLI | User-facing interface |
| 9 | Validation | Complete L0-L3 pipeline |
| 10 | Testing | Comprehensive test coverage |

---

## Next Steps

Proceed to [02-foundation.md](./02-foundation.md) to begin implementation with Thrust 1: Project Foundation.
