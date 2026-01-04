# Campaign Builder

**AI-powered simulation campaign builder for computational chemistry.**

Campaign Builder translates natural language intent into validated, production-ready simulation input files. Tell it what you want to study, provide your files, and receive complete LAMMPS or Quantum ESPRESSO input decks ready to run.

---

## The Problem

Computational chemists spend too much time on tedious, error-prone tasks:

- **Hunting for parameters** across data files, papers, and spreadsheets
- **Writing input scripts** by hand, copying from old examples
- **Debugging syntax errors** through trial and error
- **Iterating** through edit-run-fix cycles
- **Losing track** of which parameters came from where
- **Managing sprawling workflows** of disparate scripts that grew organically over time
- **Onboarding new team members** who can't understand existing simulation setups

These tasks consume hours that should be spent on science.

## The Solution

Campaign Builder uses AI agents to automate the entire workflow:

1. **You describe what you want** in natural language
2. **You provide your files** (structure files, papers, spreadsheets)
3. **AI agents analyze everything** and extract relevant information
4. **The system generates validated input decks** with full provenance
5. **You get production-ready files** that actually work

---

## How It Works

**Input:**
- Natural language intent: "Run CO2 diffusion simulation at 333K for 10 ns"
- Your files: structure.data, parameters.xlsx, reference_paper.pdf

**What Campaign Builder Does:**
1. Spawns specialized AI agents to analyze each file in parallel
2. Extracts atom types, force field parameters, box dimensions (not raw coordinates)
3. Parses your intent to understand simulation requirements
4. Plans the simulation campaign (minimization → equilibration → production)
5. Generates complete input decks with every parameter cited
6. Validates through L0-L3 (placeholders → syntax → engine → physics)
7. Repairs any issues automatically (up to 3 attempts)

**Output:**
- Ready-to-run input files (in.minimize, in.equilibrate, in.production)
- Parameter manifest showing source of every value
- Validation report proving files will run
- Campaign README explaining what each file does

---

## Use Cases

### Equilibration Setup

**You say:** "Equilibrate this MOF structure at 300K for 1 nanosecond"

**You provide:** mof_structure.data

**You get:**
- in.minimize (initial energy minimization)
- in.equilibrate (NVT equilibration at 300K)
- All force field parameters traced to specific lines in your data file
- Validation: L0 ✓, L1 ✓, L2 ✓, L3 ✓

**Time saved:** 30-60 minutes of manual scripting

### Diffusion Study

**You say:** "Calculate CO2 diffusion coefficient in this MOF at 333K"

**You provide:** framework.data, co2_params.xlsx, reference_paper.pdf

**You get:**
- Multi-step campaign with MSD tracking configured
- Parameters extracted from your spreadsheet with cell references
- Methodology informed by the reference paper
- Warnings if anything is missing or inconsistent

**Time saved:** Hours of file preparation and methodology research

### DFT Workflow

**You say:** "Relax this structure with PBE and calculate band gap"

**You provide:** POSCAR, pseudopotential files

**You get:**
- vc-relax.pwi (structure relaxation)
- scf.pwi (self-consistent calculation)
- bands.pwi (band structure)
- Correct cutoffs based on your pseudopotentials

**Time saved:** Complex multi-step DFT setup automated

### Parameter Sweep

**You say:** "Run this simulation at 250K, 300K, 350K, and 400K"

**You provide:** system.data

**You get:**
- Four validated input decks with consistent parameters
- Only temperature differs between files
- Master run script for execution

**Time saved:** Error-prone file duplication eliminated

### Debugging Help

**You say:** "Help me figure out why this simulation crashes"

**You provide:** broken_input.in, structure.data, error.log

**You get:**
- Diagnosis of specific issues with line numbers
- Explanation of what's wrong and why
- Optionally: corrected input file

**Time saved:** Hours of debugging reduced to seconds

### Workflow Unification

**You say:** "Create a proper campaign from my existing simulation files"

**You provide:** All your existing files - structure.data, in.minimize, in.equilibrate, in.production, run_all.sh, various helper scripts, parameter files

**You get:**
- Freshly generated campaign with proper structure
- New input scripts (informed by your existing ones)
- Master run script with correct execution order
- Campaign README documenting everything
- Validated generated files (L0-L3)

**The scenario:** You've built a working simulation workflow over months. Scripts were added incrementally, naming is inconsistent, and only you understand how it all fits together.

**What Campaign Builder does:** Analyzes all your files as context, then generates a complete fresh campaign. Your existing scripts inform what gets generated - the system understands your workflow, parameters, and intent from them - but the output is always newly created, validated files.

**Time saved:** Days of cleanup work, plus you get validated, documented files

---

## Key Features

### Smart File Analysis

Large structure files (500,000+ lines) are handled intelligently:
- Read headers for metadata and counts
- Grep for specific sections (Masses, Coefficients)
- Extract force field parameters completely
- Skip raw atom coordinates (just note the count)
- Produce 50-line summaries from 500,000-line files

### Complete Validation (L0-L3)

Every generated deck passes four validation levels:

| Level | What It Checks | Blocking? |
|-------|----------------|-----------|
| L0 | No placeholders ({{...}}, ${...}) | Yes |
| L1 | Correct syntax for engine | Yes |
| L2 | Engine actually accepts file | Yes |
| L3 | Physically reasonable settings | Warning |

### Full Provenance

Every parameter in generated files includes its source:
- "# pair_coeff from structure.data, line 47"
- "# temperature from user intent"
- "# timestep: 1 fs (default for organic molecules in real units)"

### Graceful Degradation

If some files fail to analyze:
- Continue with successful files
- Clearly report what failed and why
- Warn about potentially missing information
- Let the Campaign Planner work with available data

### Automatic Repair

When validation fails:
- Agent analyzes the error
- Identifies root cause
- Generates fix
- Re-validates
- Up to 3 attempts before reporting to user

---

## Supported Simulation Engines

### LAMMPS (Molecular Dynamics)

| File Type | Extensions | What's Extracted |
|-----------|------------|------------------|
| Data File | .data, .lmp | Atom types, masses, box, coefficients |
| Input Script | .in, .lammps | Commands, settings, variables |

Supported simulation types:
- Energy minimization
- NVT/NPT equilibration
- NVE production
- Diffusion (MSD) calculations
- Property calculations

### Quantum ESPRESSO (DFT)

| File Type | Extensions | What's Extracted |
|-----------|------------|------------------|
| Input | .pwi, .in | Namelists, species, settings |
| Output | .pwo, .out | Energies, structures, results |

Supported calculation types:
- SCF (self-consistent field)
- Geometry relaxation (relax, vc-relax)
- Band structure
- DOS calculations

---

## Supporting File Types

| File Type | Extensions | What's Extracted |
|-----------|------------|------------------|
| PDF | .pdf | Parameters, methods, findings |
| Excel | .xlsx, .xls | Sheets, columns, tabular data |
| CSV | .csv | Headers, data preview |
| POSCAR | POSCAR, .vasp | Species, lattice, positions |
| CIF | .cif | Crystal structure information |
| XYZ | .xyz | Species, coordinates (metadata only) |

---

## Core Principles

### Never Invent Physics

The system NEVER fabricates force field parameters. If information isn't in your files:
- The system reports exactly what's missing
- It explains why that information is needed
- It suggests what files might contain it
- It STOPS rather than guess

### Validate Everything

Every generated file is validated before delivery:
- L0: No incomplete generation
- L1: Syntactically correct
- L2: Engine accepts it
- L3: Physically reasonable

### Cite Sources

Every parameter traces to its origin:
- Which file
- Which line or cell
- Whether it's a default (and why that default is appropriate)

### Fail Loudly

When something's wrong:
- Clear error messages
- Specific line numbers
- Actionable suggestions
- Never silent assumptions

---

## What Campaign Builder Doesn't Do (Yet)

Current version (v1.0) focuses on input deck generation. Future extensions planned:

| Capability | Status | Notes |
|------------|--------|-------|
| Generate input decks | v1.0 | Current focus |
| Run simulations | Planned v2.x | Execute on local or HPC |
| Analyze results | Planned v2.x | MSD, RDF, etc. |
| Generate figures | Planned v2.x | Plots from analysis |
| Web research | Planned v2.x | Find missing parameters |
| Build structures | Planned v1.x | Create from descriptions |
| Iterative optimization | Planned v3.x | Automatic refinement |

---

## Project Structure

```
campaign-builder/
├── campaign_builder/
│   ├── cli.py                  # Command-line interface
│   ├── agent/                  # Multi-agent system
│   │   ├── file_analyzer.py    # FileAnalyzer sub-agent
│   │   ├── campaign_planner.py # Main planning agent
│   │   ├── runner.py           # Orchestrates agents
│   │   └── prompts.py          # All agent prompts
│   ├── tools/                  # Custom MCP tools
│   │   ├── documents.py        # PDF/Excel reading
│   │   └── validation.py       # L0-L3 validation
│   ├── schemas/                # Data models
│   │   ├── file_guide.py       # FileGuide dataclass
│   │   └── errors.py           # Error types
│   └── utils/                  # Utilities
│       └── hashing.py          # SHA256 for provenance
├── tests/                      # Test suite
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # System design
│   ├── SPECIFICATION.md        # Detailed specs
│   ├── IMPLEMENTATION_GUIDE.md # Build instructions
│   ├── BACKGROUND.md           # Domain context
│   └── CLAUDE.md               # AI agent instructions
└── pyproject.toml              # Project configuration
```

---

## Quick Start

### Prerequisites

- Python 3.10 or higher
- Anthropic API key

### Installation

1. Clone the repository
2. Create virtual environment: `python -m venv .venv`
3. Activate: `source .venv/bin/activate` (or `.venv\Scripts\activate` on Windows)
4. Install: `pip install -e .`
5. Configure: Create `.env` file with `ANTHROPIC_API_KEY=your-key-here`

### Basic Usage

```
campaign-builder "Your intent here" --workspace ./your_files/
```

### Example Commands

```
# Simple equilibration
campaign-builder "Equilibrate at 300K for 1ns" -w ./mof_project/

# Diffusion study
campaign-builder "Calculate CO2 diffusion at 333K" -w ./diffusion_study/

# DFT optimization
campaign-builder "Relax structure with PBE" -w ./dft_project/

# Temperature sweep
campaign-builder "Run at 300K, 350K, 400K" -w ./temp_study/

# Unify existing workflow (provide all your existing scripts)
campaign-builder "Create a proper campaign from these files" -w ./my_existing_project/
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Multi-agent design, data flow, extensibility |
| [SPECIFICATION.md](./SPECIFICATION.md) | Schemas, validation, prompts, error codes |
| [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) | Step-by-step build instructions |
| [BACKGROUND.md](./BACKGROUND.md) | Computational chemistry domain context |
| [CLAUDE.md](./CLAUDE.md) | Instructions for AI agent building this project |

---

## The Vision

Campaign Builder v1.0 is the foundation for a complete autonomous research assistant:

**Today (v1.0):** Natural language → Validated input decks

**Tomorrow (v2.x):** Natural language → Running simulations → Analyzed results → Reports

**Future (v3.x):** Natural language → Complete research workflows → Draft papers

The architecture is designed for this expansion. Each capability adds as a new agent in the pipeline, building on the foundation of intelligent file analysis and validated generation.

---

## License

MIT License - See LICENSE file for details.
