# CLAUDE.md - Instructions for Building Campaign Builder

This file provides comprehensive instructions for Claude Code to build the Campaign Builder project from scratch. It serves as the primary reference during development, containing guidance on architecture decisions, implementation priorities, and quality standards.

---

## Document Reading Order

Before writing any code, read and understand the complete documentation suite in this order:

| Order | Document | Purpose | Must Understand |
|-------|----------|---------|-----------------|
| 1 | README.md | Project vision and user value | What problem we're solving, who uses it |
| 2 | ARCHITECTURE.md | System design and data flow | Multi-agent architecture, why it works this way |
| 3 | SPECIFICATION.md | Detailed schemas and contracts | FileGuide structure, error codes, prompts |
| 4 | IMPLEMENTATION_GUIDE.md | Phase-by-phase build plan | What to build when, acceptance criteria |
| 5 | BACKGROUND.md | Domain context | Computational chemistry concepts |
| 6 | This document | Development guidance | How to approach the implementation |

**Critical:** Do not start coding until you have read all documents. The architecture decisions are intentional and documented. Deviating without understanding the rationale will create problems.

---

## Project Summary

Campaign Builder is an AI-powered tool that translates natural language intent into validated simulation input decks for computational chemistry. The user provides:
- Natural language description of what they want to simulate
- Input files (structure files, parameter spreadsheets, reference papers)

The system produces:
- Ready-to-run simulation input files (LAMMPS .in, Quantum ESPRESSO .pwi)
- Complete validation reports (L0-L3)
- Provenance manifest (source of every parameter)
- Campaign README explaining the generated files

---

## Core Architecture Decisions

These decisions are non-negotiable and must be preserved throughout development:

### 1. Multi-Agent Architecture

**The Problem:** Structure files can contain 500,000+ lines. Reading them entirely would flood the context window with useless coordinate data (the actual XYZ positions are never needed for campaign planning).

**The Solution:** Use sub-agents to analyze each file independently:
- FileAnalyzer sub-agents use Read/Grep to intelligently explore files
- Each sub-agent produces a compact FileGuide (approximately 50 lines for a 500,000 line file)
- The Campaign Planner agent receives only FileGuides, never raw data
- Sub-agents run in parallel for efficiency

**Implementation Implication:** The runner must spawn separate agent instances for file analysis, collect their FileGuide outputs, then invoke the Campaign Planner with aggregated FileGuides.

### 2. FileGuide as the Central Contract

**The Problem:** How do you communicate file contents between agents without passing the actual file data?

**The Solution:** The FileGuide dataclass is the structured summary format:
- Contains all information needed for campaign planning
- NEVER includes raw atom coordinates
- MUST include all force field parameters (epsilon, sigma values)
- Has a to_markdown() method for LLM consumption

**Implementation Implication:** The FileGuide schema in SPECIFICATION.md is the authoritative definition. All FileAnalyzer prompts must produce output matching this schema. All Campaign Planner prompts expect input in this format.

### 3. Never Invent Physics

**The Problem:** LLMs might generate plausible-looking but scientifically wrong force field parameters.

**The Solution:** Strict extraction-only policy:
- Force field parameters (ε, σ) must come from user-provided files
- Pseudopotentials must be explicitly specified
- If information is missing, REPORT IT and STOP
- Never use "typical" values or reasonable-sounding defaults for physics parameters

**Implementation Implication:** Every prompt must reinforce this rule. The Campaign Planner must check that all required parameters are present in FileGuides before generating. Validation must detect invented values.

### 4. Mandatory Four-Level Validation

**The Problem:** Generated input files might be syntactically valid but physically nonsensical, or might contain unfilled template placeholders.

**The Solution:** L0-L3 validation hierarchy:
- L0: No template placeholders remain ({{...}}, ${...}, TODO, FIXME)
- L1: Syntactically valid for the target engine
- L2: Engine binary accepts the file without error
- L3: Physics are reasonable (timesteps, temperatures, cutoffs)

**Implementation Implication:** L0 and L1 block generation. L2 requires engine binaries. L3 produces warnings. All validation results are included in output.

### 5. Unified Workflow Regardless of Input

**The Problem:** Users provide varying amounts of context - from a single structure file to entire existing workflows with dozens of scripts.

**The Solution:** The agent generates fresh output by default:
- Analyze all provided files as context
- Generate a complete, validated campaign from scratch
- Reference only what cannot reasonably be generated (e.g., complex structures)

User-provided files inform what gets generated. With minimal input, it generates a basic campaign. With extensive input (existing scripts, workflows), it has richer context and generates a more comprehensive campaign. The agent decides what can be generated fresh versus what must be referenced.

**Implementation Implication:**
- No mode detection needed - same flow always
- FileAnalyzers process all files as context
- Campaign Planner generates fresh files informed by that context
- Validation applies to generated files only

---

## Claude Agent SDK Integration

Campaign Builder is built on the Claude Agent SDK - the same infrastructure powering Claude Code. Understanding SDK capabilities is essential.

### Built-in Tools Available

The SDK provides these tools automatically:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Read | Read file contents | Header extraction, section reading |
| Glob | Find files by pattern | Discovering workspace files |
| Grep | Search file contents | Finding sections in large files |
| Bash | Execute shell commands | Line counting, file info |
| Write | Create/modify files | Writing generated decks |

### Custom Tools to Implement

Beyond SDK built-ins, Campaign Builder requires custom tools:

| Tool | Purpose | Inputs | Outputs |
|------|---------|--------|---------|
| read_pdf | Extract text from PDF files | File path | Extracted text content |
| read_excel | Read Excel spreadsheet data | File path, optional sheet name | Tabular data as text |
| read_csv | Read CSV files | File path | Tabular data as text |
| validate_l0 | Check for placeholders | File path | Pass/fail with locations |
| validate_l1_lammps | LAMMPS syntax check | File path | Pass/fail with errors |
| validate_l1_qe | QE syntax check | File path | Pass/fail with errors |
| validate_l2_lammps | Run LAMMPS check | File path | Pass/fail with output |
| validate_l2_qe | Run QE check | File path | Pass/fail with output |

### Agent Configuration

Each agent type requires specific configuration:

**FileAnalyzer Sub-Agents:**
- Allowed tools: Read, Glob, Grep, Bash, read_pdf, read_excel, read_csv
- Max turns: 15 (allow iteration for complex files)
- System prompt: FILE_ANALYZER_PROMPT from SPECIFICATION.md
- One instance per file being analyzed

**Campaign Planner Agent:**
- Allowed tools: Write, validate_l0, validate_l1_*, validate_l2_*
- Optionally: Read (if needs to revisit specific file details)
- Max turns: 10
- System prompt: CAMPAIGN_PLANNER_PROMPT from SPECIFICATION.md
- Receives aggregated FileGuides as input

---

## Implementation Phases

Follow the phases defined in IMPLEMENTATION_GUIDE.md strictly. Each phase has clear acceptance criteria.

### Phase 1: Project Foundation

**Goal:** Working Python package structure with all dependencies

**Key Decisions:**
- Use pyproject.toml for modern Python packaging
- Structure: campaign_builder/{agent,tools,schemas,utils}
- Separate tests directory with fixtures subdirectory

**Completion Criteria:**
- Package installs with pip install -e .
- Import statement works: from campaign_builder import X
- All dependencies resolve

### Phase 2: Schema Implementation

**Goal:** FileGuide and error handling structures

**Key Decisions:**
- FileType is an Enum, not strings
- FileGuide is a dataclass with optional fields for type-specific data
- Error handling uses severity levels (WARNING/ERROR/FATAL)
- ErrorHandler accumulates errors and supports graceful degradation

**Completion Criteria:**
- FileGuide can be instantiated for all file types
- to_markdown() produces readable output
- ErrorHandler correctly categorizes and reports errors

### Phase 3: Document Tools

**Goal:** PDF and Excel reading capabilities

**Key Decisions:**
- Use PyMuPDF (fitz) for PDF extraction
- Use openpyxl and pandas for Excel
- Cap extracted text at 50,000 characters to avoid context overflow
- Return structured data, not raw content

**Completion Criteria:**
- read_pdf extracts text from sample PDFs
- read_excel reads all sheets from sample files
- Large files are handled without crashing

### Phase 4: Validation Tools

**Goal:** L0-L2 validation functions

**Key Decisions:**
- L0 uses regex to find placeholders
- L1 for LAMMPS validates command structure
- L1 for QE validates namelist format
- L2 requires engine binary (skip gracefully if unavailable)
- Validators return structured ValidationResult with pass/fail, message, and details

**Completion Criteria:**
- L0 detects {{placeholder}}, ${var}, TODO, FIXME
- L1 catches common syntax errors
- L2 runs engine and captures output

### Phase 5: Agent Prompts

**Goal:** System prompts for all agents

**Key Decisions:**
- Prompts are stored in prompts.py module
- FILE_ANALYZER_PROMPT instructs how to explore files
- CAMPAIGN_PLANNER_PROMPT instructs how to use FileGuides
- Prompts include examples and explicit rules
- Prompts reinforce "never invent physics" rule

**Completion Criteria:**
- Prompts match SPECIFICATION.md exactly
- Template variables ({file_path}, {intent}) are clearly marked
- Prompts tested with manual agent runs

### Phase 6: FileAnalyzer Implementation

**Goal:** Sub-agent that produces FileGuide from any file

**Key Decisions:**
- Async function that spawns agent instance
- Returns FileGuide dataclass
- Handles analysis failure gracefully
- Respects file type differences (different strategy for .data vs .pdf)

**Completion Criteria:**
- analyze_file() works for LAMMPS .data files
- analyze_file() works for PDF files
- analyze_file() works for Excel files
- FileGuide output contains expected fields

### Phase 7: Campaign Planner Implementation

**Goal:** Main agent that produces simulation decks from FileGuides

**Key Decisions:**
- Receives list of FileGuide objects
- Uses to_markdown() to format for LLM consumption
- Writes generated decks to workspace
- Validates all output before returning

**Completion Criteria:**
- run_campaign_planner() generates LAMMPS input from FileGuides
- Generated files are written to correct location
- Validation is performed and results included

### Phase 8: Orchestration Runner

**Goal:** Main entry point that coordinates entire pipeline

**Key Decisions:**
- run_campaign_builder(intent, workspace) is the main function
- Spawns FileAnalyzer sub-agents in parallel
- Collects FileGuides, handles partial failures
- Runs Campaign Planner with collected FileGuides
- Returns CampaignResult with all outputs and reports

**Completion Criteria:**
- Full pipeline runs from intent to validated output
- Parallel file analysis works correctly
- Graceful degradation when some files fail

### Phase 9: CLI Implementation

**Goal:** Command-line interface for users

**Key Decisions:**
- Use Click framework for CLI
- Required: intent argument, --workspace option
- Optional: --output, --max-iterations, --verbose
- Progress output during execution
- Structured output at completion

**Completion Criteria:**
- CLI runs successfully with sample inputs
- Help text is clear and complete
- Error messages are actionable

### Phase 10: Testing and Polish

**Goal:** Comprehensive test coverage and documentation

**Key Decisions:**
- Unit tests for each module
- Integration tests for agent workflows
- End-to-end tests with sample workspaces
- Test fixtures include sample files of each type

**Completion Criteria:**
- All tests pass
- Coverage meets targets (see IMPLEMENTATION_GUIDE.md)
- Documentation is complete and accurate

---

## File Analysis Strategy

When implementing FileAnalyzer, use these strategies for different file types:

### LAMMPS Data Files (.data, .lmp)

These can be enormous (millions of lines). Never read the entire file.

**Analysis Strategy:**
1. Get file size and line count using Bash wc command
2. Read first 50 lines to capture header (counts, box dimensions)
3. Use Grep to find "Masses" section, then Read just that section
4. Use Grep to find "Pair Coeffs" section, then Read just that section
5. Similarly for Bond Coeffs, Angle Coeffs, Dihedral Coeffs
6. Use Grep to find "Atoms" section - note its presence but do NOT read it
7. Compile findings into FileGuide

**What to Extract:**
- Atom count, bond count, angle count, dihedral count
- Number of types (atom types, bond types, etc.)
- Box dimensions (xlo/xhi, ylo/yhi, zlo/zhi)
- Complete Masses table with comments (element identifiers)
- Complete Pair Coeffs with style indicator
- Complete Bond/Angle/Dihedral Coeffs if present
- Atom style (from Atoms section comment)

**What to Skip:**
- Atoms section (raw coordinates)
- Bonds section (topology lists)
- Angles section
- Velocities section

### LAMMPS Input Scripts (.in, .lammps)

These are typically small and can be read entirely.

**Analysis Strategy:**
1. Read the entire file
2. Parse to identify all commands
3. Note units, atom_style, boundary conditions
4. Extract pair_style and pair_coeff specifications
5. Identify fix commands and their parameters
6. Note any variable definitions

**What to Extract:**
- Unit system
- Atom style
- Pair style and all coefficients
- Bond/angle/dihedral styles if present
- Thermostat/barostat settings
- Run parameters (timestep, run length)
- Output commands (dump, thermo)

### Quantum ESPRESSO Input Files (.pwi, .in)

These are typically small and can be read entirely.

**Analysis Strategy:**
1. Read the entire file
2. Parse namelists (&CONTROL, &SYSTEM, &ELECTRONS, etc.)
3. Extract cards (ATOMIC_SPECIES, ATOMIC_POSITIONS, K_POINTS)
4. Note calculation type and key parameters

**What to Extract:**
- Calculation type (scf, relax, vc-relax, etc.)
- Pseudopotential specifications
- Cutoff energies (ecutwfc, ecutrho)
- K-point sampling
- Convergence thresholds
- Number of atoms and species

### PDF Files

**Analysis Strategy:**
1. Use read_pdf tool to extract text
2. Scan for force field parameters (epsilon, sigma, LJ)
3. Look for methodology descriptions
4. Identify temperatures, pressures, conditions
5. Note any cited sources

**What to Extract:**
- Any numeric force field parameters found
- Methodology descriptions
- Conditions (temperature, pressure)
- Software/engine mentioned
- Key findings if relevant

### Excel Files

**Analysis Strategy:**
1. Use read_excel tool to read all sheets
2. Identify column headers
3. Look for parameter tables
4. Extract numeric data with units

**What to Extract:**
- Sheet names and their apparent purpose
- Column headers
- Data types in each column
- Any parameter values with units
- Row count for each table

---

## Error Handling Philosophy

### Severity Levels

**WARNING:** Continue processing but inform user
- Example: A PDF couldn't be parsed but other files succeeded
- Example: L3 validation found questionable timestep

**ERROR:** This operation failed but others may succeed
- Example: One file in workspace couldn't be analyzed
- Example: L1 validation failed for generated deck

**FATAL:** Cannot continue at all
- Example: No files could be analyzed
- Example: No force field parameters found anywhere
- Example: SDK connection failed

### Graceful Degradation

When some operations fail:
1. Continue with what succeeded
2. Clearly report what failed and why
3. Warn about implications of missing information
4. Let downstream processing work with available data

Example: If 4 files are provided and 1 fails analysis:
- Continue with 3 FileGuides
- Report the failed file with error details
- Warn that information from that file is unavailable
- Campaign Planner works with available FileGuides
- If critical info was in failed file, Campaign Planner will identify the gap

### Error Reporting Format

Every error should include:
- Error code (E101, E201, etc.) from taxonomy
- Severity level
- Clear message describing what happened
- File path if applicable
- Suggestion for user action

---

## Testing Strategy

### Unit Tests

Test individual functions in isolation:

**Schema Tests:**
- FileGuide instantiation for each file type
- to_markdown() produces expected format
- ErrorHandler severity categorization
- ErrorHandler accumulation and reporting

**Tool Tests:**
- read_pdf with sample PDF
- read_excel with sample spreadsheet
- validate_l0 with files containing placeholders
- validate_l0 with clean files
- validate_l1_lammps with valid/invalid syntax

### Integration Tests

Test agent workflows:

**FileAnalyzer Tests:**
- Analyze sample LAMMPS .data file
- Analyze sample PDF
- Analyze sample Excel file
- Verify FileGuide output structure

**Campaign Planner Tests:**
- Generate deck from mock FileGuides
- Verify validation is performed
- Check output file creation

### End-to-End Tests

Test complete pipeline:

**Smoke Test:**
- Simple equilibration intent with single .data file
- Should produce valid LAMMPS input

**Complex Test:**
- Multiple files (structure, parameters, reference)
- Should correctly integrate information from all sources

### Test Fixtures

Create sample files for testing:

**sample_mof.data:**
- Small LAMMPS data file (10-20 atoms)
- Include Masses, Pair Coeffs sections
- Representative of real usage

**sample_params.xlsx:**
- Excel file with force field parameters
- Multiple sheets with different data

**sample_reference.pdf:**
- PDF with methodology text
- Include some parameters in text

---

## Quality Standards

### Code Style

- Follow PEP 8 conventions
- Use type hints for all function signatures
- Docstrings for all public functions and classes
- Async/await for all agent operations
- Meaningful variable names (not single letters except for obvious iterators)

### Error Messages

- Always actionable (tell user what to do)
- Include relevant context (file path, line number)
- Never technical jargon without explanation
- Suggest next steps when possible

### Documentation

- Docstrings match function behavior exactly
- README kept up to date with API changes
- Examples work when copied and run
- No dead links in documentation

### Security

- Never execute arbitrary user code
- Validate file paths before access
- Sanitize any user input used in Bash commands
- Cap file sizes and processing time

---

## Common Issues and Solutions

### Context Overflow

**Symptom:** Agent reads too much data and runs out of context

**Solution:** FileAnalyzer must use Grep to locate sections, then Read only specific ranges. Never read entire large files.

### Missing Force Field Parameters

**Symptom:** Campaign Planner cannot generate deck because parameters are missing

**Solution:** FileAnalyzer must extract ALL force field sections completely. Verify extraction by checking FileGuide contains pair_coeffs, bond_coeffs, etc.

### Invalid Syntax in Generated Decks

**Symptom:** L1 validation fails on generated output

**Solution:** Review Campaign Planner prompt examples. Ensure proper format for target engine. May need more examples in prompt.

### Engine Binary Not Found

**Symptom:** L2 validation skipped

**Solution:** This is acceptable if user doesn't have LAMMPS/QE installed. Document that L2 requires engine binaries. Provide path configuration via environment variables.

### Slow File Analysis

**Symptom:** FileAnalyzer takes too long on large files

**Solution:** Ensure strategy uses Grep before Read. Limit Read to specific line ranges. Consider adding timeout.

---

## Environment Configuration

### Required Environment Variables

| Variable | Purpose | Format |
|----------|---------|--------|
| ANTHROPIC_API_KEY | Claude API authentication | sk-ant-... |

### Optional Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| LAMMPS_PATH | Path to LAMMPS binary | lmp (use PATH) |
| QE_PATH | Path to pw.x binary | pw.x (use PATH) |
| CB_MAX_FILE_SIZE | Maximum file size to analyze | 500MB |
| CB_TIMEOUT | Timeout for agent operations | 120s |

---

## Development Workflow

### Getting Started

1. Clone repository
2. Create virtual environment
3. Install dependencies including dev dependencies
4. Set up ANTHROPIC_API_KEY
5. Run existing tests to verify setup
6. Read all documentation

### Adding a Feature

1. Check if documented in SPECIFICATION.md or IMPLEMENTATION_GUIDE.md
2. Write test for expected behavior
3. Implement feature
4. Run tests
5. Update documentation if API changed
6. Create example if user-facing

### Debugging Agents

1. Use verbose logging to see agent turns
2. Check prompts match SPECIFICATION.md exactly
3. Verify tools return expected format
4. Check FileGuide structure matches schema
5. Review SDK error messages carefully

### Making Changes

1. Understand the rationale for existing design
2. Discuss significant changes before implementing
3. Maintain backward compatibility where possible
4. Update all affected documentation
5. Add tests for new behavior

---

## Implementation Progress Tracking

Track implementation using this checklist:

**Phase 1: Project Foundation**
- [ ] Directory structure created
- [ ] pyproject.toml configured
- [ ] Package installs correctly
- [ ] All dependencies resolve

**Phase 2: Schemas**
- [ ] FileType enum complete
- [ ] FileGuide dataclass complete
- [ ] to_markdown() implemented
- [ ] Error classes complete
- [ ] ErrorHandler complete

**Phase 3: Document Tools**
- [ ] read_pdf tool implemented
- [ ] read_excel tool implemented
- [ ] read_csv tool implemented
- [ ] Tools handle errors gracefully

**Phase 4: Validation Tools**
- [ ] L0 validator complete
- [ ] L1 LAMMPS validator complete
- [ ] L1 QE validator complete
- [ ] L2 LAMMPS executor complete
- [ ] L2 QE executor complete

**Phase 5: Agent Prompts**
- [ ] FILE_ANALYZER_PROMPT complete
- [ ] CAMPAIGN_PLANNER_PROMPT complete
- [ ] Prompts match SPECIFICATION.md

**Phase 6: FileAnalyzer**
- [ ] analyze_file() implemented
- [ ] Handles LAMMPS .data files
- [ ] Handles PDF files
- [ ] Handles Excel files
- [ ] Returns proper FileGuide

**Phase 7: Campaign Planner**
- [ ] run_campaign_planner() implemented
- [ ] Generates LAMMPS input
- [ ] Generates QE input
- [ ] Validates output

**Phase 8: Orchestration**
- [ ] run_campaign_builder() implemented
- [ ] Parallel file analysis works
- [ ] Graceful degradation works
- [ ] Complete pipeline runs

**Phase 9: CLI**
- [ ] Click command implemented
- [ ] All options working
- [ ] Help text complete
- [ ] Error handling good

**Phase 10: Testing**
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] End-to-end tests pass
- [ ] Coverage targets met

---

## Quick Reference

### Main Entry Point

The primary user-facing command is the CLI that accepts natural language intent and a workspace path.

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| run_campaign_builder | agent/runner.py | Main orchestration |
| analyze_file | agent/file_analyzer.py | Single file analysis |
| analyze_all_files | agent/file_analyzer.py | Parallel file analysis |
| run_campaign_planner | agent/campaign_planner.py | Deck generation |
| validate_deck | tools/validation.py | L0-L2 validation |

### Key Classes

| Class | Location | Purpose |
|-------|----------|---------|
| FileGuide | schemas/file_guide.py | File summary structure |
| FileType | schemas/file_guide.py | File type enumeration |
| CampaignError | schemas/errors.py | Structured error |
| ErrorHandler | schemas/errors.py | Error accumulation |
| ValidationResult | tools/validation.py | Validation output |

---

## Final Notes for Claude Code

### Priorities

1. **Correctness over speed** - Never generate wrong physics
2. **Clarity over cleverness** - Straightforward code that works
3. **Fail loudly** - Never silently skip important steps
4. **Document everything** - Future you will thank present you

### Things to Always Do

- Read all documentation before starting
- Follow the phase order in IMPLEMENTATION_GUIDE.md
- Test each component before moving on
- Use the schemas exactly as specified
- Include the exact prompts from SPECIFICATION.md
- Validate all generated output

### Things to Never Do

- Invent force field parameters in tests or examples
- Skip validation steps
- Read entire large files into context
- Guess at user intent when unclear
- Proceed when critical information is missing
- Deviate from architecture without documented rationale

---

This document provides the guidance needed to implement Campaign Builder correctly. The other documentation files contain the detailed specifications. When in doubt, refer to SPECIFICATION.md for schema details and IMPLEMENTATION_GUIDE.md for phase requirements.
