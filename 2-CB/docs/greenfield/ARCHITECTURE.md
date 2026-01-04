# Architecture

This document describes the multi-agent architecture of Campaign Builder, explaining the design decisions, data flow, and how the system achieves its goals.

---

## Table of Contents

1. [System Vision](#system-vision)
2. [Why Multi-Agent Architecture](#why-multi-agent-architecture)
3. [System Flow](#system-flow)
4. [Agent Roles and Responsibilities](#agent-roles-and-responsibilities)
5. [The File Guide Contract](#the-file-guide-contract)
6. [Tool Architecture](#tool-architecture)
7. [Validation Pipeline](#validation-pipeline)
8. [Error Handling Strategy](#error-handling-strategy)
9. [Context Management](#context-management)
10. [Security Model](#security-model)
11. [Extensibility Architecture](#extensibility-architecture)
12. [Future Pipeline Vision](#future-pipeline-vision)

---

## System Vision

### The Core Problem

Computational chemists face a fundamental workflow challenge:

1. **Information is scattered** - Force field parameters in data files, methodologies in papers, settings in spreadsheets
2. **Files are large** - Structure files with millions of atoms, trajectories spanning gigabytes
3. **Expertise is required** - Knowing which parameters matter, what settings are appropriate, how to validate
4. **Iteration is slow** - Write → Run → Debug → Repeat cycles waste hours

### The Solution

Campaign Builder uses AI agents that can:

1. **Read and understand** diverse file types intelligently
2. **Extract and organize** scattered information into coherent summaries
3. **Apply domain expertise** through carefully crafted prompts
4. **Generate and validate** production-ready simulation files
5. **Explain and cite** every decision for reproducibility

### Design Philosophy

**"Let the AI think, but verify everything."**

The system embraces AI capabilities for understanding and generation while maintaining rigorous validation to ensure correctness. Key principles:

1. **Agents have freedom to explore** - FileAnalyzers can use any strategy to understand files
2. **Outputs are strictly validated** - L0-L3 validation catches errors before users see them
3. **Sources are always cited** - Every parameter traces back to its origin
4. **Failures are explicit** - Missing information is reported, never assumed

---

## Why Multi-Agent Architecture

### The Single-Agent Problem

A naive approach might use one agent to read all files and generate output. This fails for several reasons:

**Context Overflow**
A typical MOF structure file contains 500,000+ lines. Raw atom coordinates provide no useful information for campaign planning but would consume the entire context window, leaving no room for actual reasoning.

**Lost Information**
When context is limited, important details get truncated. Force field parameters buried at line 47 might be lost while useless coordinate data is preserved.

**No Parallelism**
Sequential file reading means processing 5 files takes 5x the time, even though files are independent.

**Debugging Difficulty**
When something goes wrong, it's impossible to know what information the agent extracted from which file.

### The Multi-Agent Solution

| Challenge | Single Agent | Multi-Agent |
|-----------|--------------|-------------|
| Large files | Context overflow | Sub-agent extracts only what's needed |
| Information density | Important data lost in noise | File Guides contain only relevant data |
| Processing time | Sequential (5x for 5 files) | Parallel (time of slowest file) |
| Debugging | Black box | Clear File Guides show what was extracted |
| Specialization | One agent does everything poorly | Specialists for analysis vs. planning |
| Context usage | Wastes context on raw data | Main agent sees compact summaries only |

### The Key Insight: File Guides as Contract

The File Guide is the critical abstraction that makes multi-agent work. It's a structured summary that:

- Contains everything the Campaign Planner needs
- Excludes everything the Campaign Planner doesn't need (raw coordinates)
- Is compact enough to fit in context alongside other File Guides
- Is inspectable for debugging and verification

A 523,000 line structure file becomes a 50-line File Guide containing atom types, masses, box dimensions, and force field coefficients - exactly what's needed for campaign planning.

---

## System Flow

### Phase 1: Workspace Staging

**Input:** User-provided files + natural language intent

**Process:**
1. Receive files from user (via CLI, API, or upload)
2. Copy files to isolated workspace directory
3. Compute SHA256 hash for each file (provenance tracking)
4. Detect file types by extension and content sampling
5. Create file inventory with metadata

**Output:** Staged workspace with complete file inventory

**Purpose:** Ensures all files are accessible, tracked, and categorized before analysis begins.

### Phase 2: File Analysis (Parallel Sub-Agents)

**Input:** File inventory from Phase 1

**Process:**
1. Spawn FileAnalyzer sub-agent for each file
2. Sub-agents run in parallel, each in isolated context
3. Each sub-agent explores its assigned file:
   - Checks file size and structure
   - Uses appropriate reading strategy (full read vs. targeted grep)
   - Extracts all relevant information
   - Notes what couldn't be determined
4. Each sub-agent produces a File Guide
5. Collect all File Guides when sub-agents complete
6. Handle any sub-agent failures gracefully

**Output:** List of File Guides (one per successfully analyzed file)

**Purpose:** Convert diverse, large files into compact, structured summaries optimized for LLM reasoning.

**Parallelism:** With 5 files, this phase takes ~1x the time of analyzing the largest/most complex file, not 5x.

### Phase 3: Campaign Planning (Main Agent)

**Input:**
- User's natural language intent
- All File Guides from Phase 2

**Process:**
1. Parse user intent to identify:
   - Target property (diffusion, energy, structure, etc.)
   - Simulation type (equilibration, production, relaxation)
   - Conditions (temperature, pressure, duration)
   - Special requirements
2. Analyze File Guides to understand:
   - What structure information is available
   - What force field parameters exist
   - What constraints or conflicts exist
3. Check for missing critical information:
   - If missing: STOP, report what's needed
   - If complete: proceed to planning
4. Design campaign structure:
   - Number and type of simulation steps
   - Dependencies between steps
   - Expected outputs from each step
5. Generate input decks:
   - Write complete, syntactically correct files
   - Cite source for every parameter
   - Follow engine best practices
6. Submit for validation

**Output:**
- Campaign plan document
- Generated input deck files
- Validation request

**Purpose:** Translate user intent + extracted information into executable simulation files.

### Phase 4: Validation Pipeline

**Input:** Generated input deck files

**Process:**
1. L0 Validation (Template Completeness):
   - Scan for placeholder patterns
   - If found: report and return to Phase 3 for repair
2. L1 Validation (Syntax):
   - Engine-specific syntax checks
   - Required commands, order, completeness
   - If errors: report and return to Phase 3 for repair
3. L2 Validation (Engine Acceptance):
   - Run actual simulation engine in check mode
   - Capture any error messages
   - If rejected: report and return to Phase 3 for repair
   - If engine unavailable: skip with warning
4. L3 Validation (Physical Reasonableness):
   - Check physical plausibility of settings
   - Domain-specific sanity checks
   - Report warnings (non-blocking)

**Repair Loop:**
- Maximum 3 repair attempts per validation level
- Agent analyzes error, generates fix, re-validates
- If repairs fail: report to user with full context

**Output:** Validation results for each level

**Purpose:** Ensure generated files will actually run and produce meaningful results.

### Phase 5: Delivery

**Input:** Validated input decks + all metadata

**Process:**
1. Package final campaign artifacts:
   - Input deck files
   - Parameter manifest with sources
   - Validation report
   - Run script
   - Campaign README
2. Generate provenance record:
   - Input file hashes
   - Timestamps
   - Version information
3. Present to user with clear summary

**Output:** Complete campaign package ready for execution

**Purpose:** Deliver production-ready simulation files with full documentation.

---

## Agent Roles and Responsibilities

### FileAnalyzer Sub-Agent

**Mission:** Deeply understand a single file and produce a comprehensive, compact summary.

**Available Tools:**
- Read: Read file content with optional line range
- Glob: Find files matching patterns
- Grep: Search for patterns in files
- Bash: Execute shell commands (wc -l, head, tail, etc.)
- read_pdf: Extract text from PDF documents
- read_excel: Read Excel spreadsheet data
- read_csv: Read CSV file data

**Iteration Limit:** 15 turns maximum

**Key Behaviors:**

For Structure Files:
1. First action: Check file size (wc -l)
2. Read header section (first 50-100 lines) for counts and dimensions
3. Use Grep to locate important sections (Masses, Pair Coeffs, etc.)
4. Read only those sections
5. NEVER read Atoms section (just note the count)
6. Extract all force field coefficients completely

For PDFs:
1. Use read_pdf tool to extract text
2. Identify document type (paper, manual, datasheet)
3. Search for specific parameters and values
4. Note methodology, force fields mentioned, software used
5. Extract any tabulated data

For Excel/CSV:
1. Read structure (sheets, columns, row count)
2. Identify what data represents
3. Preview first rows
4. Note any parameter columns

**Output Requirements:**
- Complete File Guide with all required fields
- Confidence level based on extraction success
- List of anything that couldn't be determined
- Warnings about potential issues

### Campaign Planner Agent

**Mission:** Create a complete, validated simulation campaign from user intent and File Guides.

**Available Tools:**
- Write: Create output files in workspace
- validate_deck: Run L0-L3 validation
- Read: Access original files (use sparingly, only when File Guide insufficient)

**Iteration Limit:** 10 turns maximum

**Key Insight:** The agent generates fresh output by default - user-provided files serve as context that informs generation, not templates to copy or modify. With minimal input, it generates a basic campaign. With extensive input (existing scripts, workflows), it has richer context and generates a more comprehensive campaign. The agent determines what can be generated fresh versus what must be referenced (e.g., a complex structure that cannot reasonably be recreated).

**Key Behaviors:**

Intent Analysis:
- Parse natural language to identify concrete simulation requirements
- Ask for clarification if intent is ambiguous (if interactive mode)
- Map intent to specific simulation types and parameters

File Guide Analysis:
- Identify role of each file (structure, parameters, existing scripts, methodology reference)
- Extract needed parameters with source tracking
- Trace file dependencies (read_data, restart files, include directives)
- Detect conflicts between files
- Verify completeness of required information

Generation Rules:
- NEVER invent force field parameters
- Cite source for every parameter in comments
- Use engine best practices and conventions
- Include appropriate output and monitoring commands
- Follow consistent formatting
- Generate master run scripts for multi-step campaigns

Validation Integration:
- Always validate generated files before considering deck complete
- Analyze validation failures and attempt repair
- Maximum 3 repair attempts before escalating to user

**Output Requirements:**
- Campaign plan document explaining strategy
- Complete input deck files
- Master run script with execution order
- Campaign README documenting the workflow
- Parameter manifest with full provenance
- Dependency information (file relationships)
- Validation results for generated files
- Any assumptions made with justification
- Warnings about potential issues

---

## The File Guide Contract

### What is a File Guide?

The File Guide is the central data structure that enables the multi-agent architecture. It's a structured summary that serves as the contract between FileAnalyzer sub-agents and the Campaign Planner.

### Design Principles

**Compact:** A 500,000 line file becomes ~50 lines of structured data. This is essential for fitting multiple File Guides in the Campaign Planner's context.

**Complete:** Contains ALL information needed for campaign planning. The Campaign Planner should not need to re-read original files.

**No Raw Data:** Never includes atom coordinates, trajectory frames, or large data blocks. These waste context and provide no planning value.

**Typed:** Clear data types for each field enable structured reasoning.

**Self-Describing:** Includes metadata about the analysis itself (iterations used, confidence level, what couldn't be determined).

### Information Flow

```
Original File (500K lines)
         │
         ▼
  FileAnalyzer Sub-Agent
  (15 iterations max)
         │
         ▼
  File Guide (~50 lines)
         │
         ▼
  Campaign Planner
  (sees only File Guides)
```

### What Goes In vs. What Stays Out

**Included in File Guide:**
- File metadata (name, type, size, hash)
- Atom type definitions with masses and labels
- Box dimensions
- ALL force field coefficients (pair, bond, angle, dihedral)
- Simulation settings and commands
- Key parameters from documents
- Line numbers for critical sections

**Excluded from File Guide:**
- Individual atom coordinates
- Individual bond/angle/dihedral definitions
- Trajectory data
- Raw text from documents (only extracted parameters)
- Formatting and whitespace

### Example Transformation

A LAMMPS data file with 523,847 lines becomes:

```
File Guide Summary:
- 523,747 atoms (15 types)
- Box: 0.0 to 45.2 Angstroms (cubic)
- Pair style: lj/cut/coul/long 12.0
- 15 pair coefficients (all extracted)
- Bond style: harmonic, 5 types
- Angle style: harmonic, 3 types
- Confidence: high
- Missing: dihedral coefficients (section not found)
```

The Campaign Planner receives this summary, not 500K lines of coordinates.

---

## Tool Architecture

### Built-in Tools (Claude Agent SDK)

The Claude Agent SDK provides these tools automatically:

**Read(path, offset?, limit?)**
- Reads file content as text
- Supports line range specification
- Returns content with line numbers

**Glob(pattern, path?)**
- Finds files matching glob patterns
- Returns list of matching paths

**Grep(pattern, path, flags?)**
- Searches for regex patterns
- Returns matching lines with context
- Supports common regex flags

**Bash(command, timeout?)**
- Executes shell commands
- Captures stdout and stderr
- Configurable timeout

**Write(path, content)**
- Writes content to file
- Creates parent directories as needed

### Custom Tools (Domain-Specific)

Custom tools are registered via MCP (Model Context Protocol) and provide domain-specific functionality:

**read_pdf(path, pages?, max_chars?)**
- Purpose: Extract text from PDF documents
- Handles multi-page documents
- Preserves page structure
- Truncates if exceeds size limit
- Reports extraction quality

**read_excel(path, sheet?, max_rows?)**
- Purpose: Read Excel spreadsheet data
- Lists all sheets in workbook
- Returns data as formatted text
- Infers column types
- Handles merged cells

**read_csv(path, delimiter?, max_rows?)**
- Purpose: Read CSV file data
- Auto-detects delimiter
- Returns formatted data
- Infers column types

**validate_deck(path, engine, levels?, structure_file?)**
- Purpose: Run L0-L3 validation
- Engine-specific validation logic
- Returns structured validation results
- Provides repair suggestions

**get_structure_summary(path, format?)**
- Purpose: Smart extraction from large structure files
- Extracts metadata and coefficients
- NEVER reads coordinates
- Returns structured summary

### Tool Selection by Agent

**FileAnalyzer Sub-Agents have access to:**
- Read, Glob, Grep, Bash (for file exploration)
- read_pdf, read_excel, read_csv (for specific file types)
- get_structure_summary (for large structure files)

**Campaign Planner Agent has access to:**
- Write (to create output files)
- validate_deck (to validate generated files)
- Read (emergency access if File Guide insufficient)

This separation ensures:
- FileAnalyzers focus on understanding files
- Campaign Planner focuses on generation and validation
- Tools match agent responsibilities

---

## Validation Pipeline

### Why Four Levels?

Each validation level catches different classes of errors:

**L0 (Template Completeness):** Catches incomplete generation where placeholders remain. If L0 fails, the deck definitely won't run.

**L1 (Syntax Validation):** Catches command errors that any reasonable parser would catch. Faster than running the actual engine.

**L2 (Engine Acceptance):** Catches subtle issues that only the real engine would find - incompatible options, missing files, numerical issues.

**L3 (Physical Reasonableness):** Catches issues that would run but produce garbage - timesteps too large, cutoffs too long, temperatures unreasonable.

### Validation Flow

```
Generated Deck
      │
      ▼
   ┌──────┐
   │  L0  │──FAIL──▶ Report placeholders
   └──┬───┘          │
      │ PASS         ▼
      │          Attempt repair (max 3)
      ▼              │
   ┌──────┐          │
   │  L1  │──FAIL────┘
   └──┬───┘
      │ PASS
      ▼
   ┌──────┐
   │  L2  │──FAIL──▶ Report engine error
   └──┬───┘          │
      │ PASS (or     ▼
      │ skip if      Attempt repair (max 3)
      │ unavailable) │
      ▼              │
   ┌──────┐          │
   │  L3  │──WARN────┼──▶ Report warnings
   └──┬───┘          │     (non-blocking)
      │              │
      ▼              ▼
   SUCCESS        If repairs fail:
   (with any      Report to user
   L3 warnings)
```

### Repair Loop

When validation fails, the agent can attempt repairs:

1. **Analyze Error:** Parse validation output to understand what failed
2. **Identify Cause:** Determine root cause (missing parameter, wrong syntax, etc.)
3. **Generate Fix:** Modify the deck to address the issue
4. **Re-validate:** Run validation again from the failed level
5. **Iterate or Escalate:** Try up to 3 times, then report to user

Repair is NOT appropriate when:
- Information is fundamentally missing (e.g., no force field parameters)
- The error requires user decision (e.g., choosing between options)
- Multiple conflicting issues exist

---

## Error Handling Strategy

### Error Categories

**File Errors (E1xx):** Problems accessing or reading files
- File not found, too large, unreadable, unknown type

**Analysis Errors (E2xx):** Problems during file analysis
- Timeout, parse failure, extraction failure

**Validation Errors (E3xx):** Problems during validation
- L0/L1/L2/L3 failures, engine not found

**Campaign Errors (E4xx):** Problems during planning
- Missing parameters, conflicting information, unsupported request

**System Errors (E5xx):** Infrastructure problems
- API errors, timeout, unexpected exceptions

### Severity Levels

**Info:** Continue processing, note for user. Example: "Using default timestep of 1 fs"

**Warning:** Continue processing, warn user prominently. Example: "Cutoff is 90% of half box size"

**Error:** Skip this item, continue with others. Example: "Could not parse file X, continuing with others"

**Fatal:** Stop entire process. Example: "No force field parameters available anywhere"

### Graceful Degradation

The system continues with partial information when possible:

1. If 3/4 files analyze successfully, proceed with 3 File Guides
2. Clearly report which file failed and why
3. Warn user about potentially missing information
4. Campaign Planner works with available data

This approach is better than failing completely when most information is available.

### Error Reporting

Every error includes:
- Error code (E101, E203, etc.)
- Human-readable message
- File path if relevant
- Line number if relevant
- Suggestion for resolution
- Context for debugging

---

## Context Management

### The Context Challenge

LLM context windows are limited. A structure file might have 500,000 lines, but context might only hold 100,000 tokens. Raw file content would overwhelm the context, leaving no room for reasoning.

### Sub-Agent Context Strategy

Each FileAnalyzer sub-agent gets:
- System prompt with analysis instructions
- Assigned file path
- Access to tools
- Fresh context (not shared with other sub-agents)

Sub-agents can iterate up to 15 times, using tools to explore files without loading everything into context. They output a compact File Guide that fits comfortably in context.

### Main Agent Context Strategy

Campaign Planner receives:
- System prompt with planning instructions
- User intent (typically short)
- All File Guides formatted as markdown
- Access to Write and validate tools

File Guides are designed to be compact, so 5-10 files produce perhaps 500 lines of structured data - easily fitting in context alongside the prompts and generation output.

### Context Compaction

If context approaches limits:
- Claude Agent SDK automatically summarizes older messages
- Tool results may be compacted
- Critical information (File Guides, recent generation) is preserved

---

## Security Model

### Workspace Isolation

All file operations are confined to the designated workspace:
- Agents cannot access files outside workspace
- File paths are validated before operations
- No access to system files or sensitive directories

### Tool Restrictions

**Bash tool:**
- Available for file exploration (wc, head, grep, etc.)
- Dangerous commands blocked at SDK level
- Output is captured and visible

**Write tool:**
- Only creates files in workspace
- Cannot overwrite system files
- Cannot execute written files

### API Key Management

- API keys stored in environment variables or .env file
- Never logged in outputs or error messages
- Never included in generated files
- .env excluded from version control

### Input Validation

- File paths validated before reading
- File sizes checked before processing
- Binary files handled appropriately (only PDF/Excel supported)
- Malicious file content would produce broken output (fails safe)

---

## Extensibility Architecture

### Current Extension Points

**Adding New File Types:**
1. Add file type to FileType enumeration
2. Add detection logic based on extension/content
3. Add type-specific fields to File Guide schema
4. Update FileAnalyzer prompt with handling instructions
5. Optionally add specialized tool (like read_pdf)

**Adding New Simulation Engines:**
1. Add engine to supported engines list
2. Create L1 validation logic for engine syntax
3. Create L2 validation logic (run engine in check mode)
4. Create L3 validation rules for physical reasonableness
5. Update Campaign Planner prompt with engine guidance
6. Add example inputs/outputs for few-shot learning

**Adding New Custom Tools:**
1. Define tool with MCP interface
2. Register tool with MCP server
3. Add to appropriate agent's allowed_tools list
4. Document tool behavior in prompts
5. Add handling for tool errors

### Modular Agent Design

Each agent is a self-contained module with:
- Clear inputs (what it receives)
- Clear outputs (what it produces)
- Defined tool access
- Configurable iteration limits
- Independent context

This modularity enables:
- Testing agents in isolation
- Swapping agent implementations
- Adding new agents to the pipeline
- Parallel development

---

## Future Pipeline Vision

### Current Pipeline (v1.0)

```
User Intent + Files
        │
        ▼
┌───────────────────┐
│  File Staging     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  File Analyzer    │ (parallel, per file)
│  Sub-Agents       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Campaign Planner │
│  Agent            │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Validator        │
└───────────────────┘
        │
        ▼
   Campaign Package
```

### Planned Extensions

**Structure Generation (v1.x):**
Insert before File Analyzer to create structures from descriptions.

**Execution Management (v2.x):**
Insert after Validation to actually run simulations.

**Post-Processing Analysis (v2.x):**
Insert after Execution to analyze results and generate figures.

**Research Assistant (v2.x):**
Insert before everything to find missing information via web search.

**Iterative Refinement (v3.x):**
Create feedback loop from Analysis back to Planning for optimization.

### Complete Vision Pipeline

```
User Intent
     │
     ▼
┌─────────────────┐
│ Research Agent  │ ─── Find missing info from literature
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Structure Gen   │ ─── Create structures if needed
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ File Analyzer   │ ─── Understand all inputs
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Campaign Plan   │ ─── Design simulation strategy
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Deck Generator  │ ─── Write input files
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Validator       │ ─── Ensure correctness
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Executor        │ ─── Run simulations
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Monitor         │ ─── Track progress
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Analyzer        │ ─── Process results
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Reporter        │ ─── Generate outputs
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Iterator        │ ─── Plan next steps
└─────────────────┘
     │
     └───────────────▶ (back to Campaign Plan)
```

### Extension Interface

Every agent/extension implements a standard interface:

| Method | Purpose |
|--------|---------|
| can_handle(intent, context) | Determine if this agent applies |
| get_required_inputs() | Declare input requirements |
| get_produced_outputs() | Declare output types |
| execute(inputs) | Perform main function |
| validate_output(output) | Verify output correctness |
| get_status() | Report current state |

This enables:
- Dynamic pipeline construction based on user intent
- Parallel execution where dependencies allow
- Clear data contracts between stages
- Easy addition of new capabilities
- Testing agents in isolation
