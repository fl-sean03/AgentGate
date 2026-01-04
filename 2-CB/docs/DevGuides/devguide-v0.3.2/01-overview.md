# Overview: LAMMPS Reaper Architecture

## Current State

Campaign Builder is a comprehensive multi-engine simulation platform with:
- Multi-agent orchestration
- Dual engine support (LAMMPS + QE)
- Complex file analysis pipelines
- Campaign planning with phases

**This is too much for simple LAMMPS deck generation.**

---

## Target State

Reaper is a **minimal, focused** LAMMPS deck generator:

```
┌─────────────────────────────────────────────────────────────┐
│                      LAMMPS REAPER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐ │
│  │  Intent  │───▶│   LLM    │───▶│ Validate │───▶│ Output│ │
│  │  + Files │    │ Generate │    │  L0-L3   │    │ .in   │ │
│  └──────────┘    └──────────┘    └──────────┘    └───────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Minimal Dependencies
- Only `anthropic` and `pydantic`
- No complex frameworks
- Single LAMMPS engine

### 2. Single Responsibility
- One job: generate LAMMPS decks
- No campaign planning
- No multi-file orchestration

### 3. Direct Generation
- LLM generates complete deck in one call
- No multi-turn conversations
- No tool calling (optional validation tools)

### 4. Comprehensive Validation
- L0: Placeholder detection
- L1: LAMMPS syntax validation
- L2: Engine acceptance (dry run)
- L3: Physics sanity checks

---

## Architecture Decisions

### Why Not Reuse Campaign Builder?

| Aspect | Campaign Builder | Reaper |
|--------|-----------------|--------|
| Engines | LAMMPS + QE | LAMMPS only |
| Agents | Multi-agent orchestration | Single LLM call |
| Files | Complex analysis pipeline | Simple file reading |
| Output | Multi-phase campaigns | Single input deck |
| Code Size | ~10,000 lines | ~500 lines |

### Provider Strategy

Reaper uses a **direct Anthropic client**:
- No adapter abstraction (single provider)
- Simple async/await pattern
- Built-in retry with exponential backoff

### Validation Pipeline

Reuse existing validators from Campaign Builder:
- Import `campaign_builder.tools.validation` modules
- Wrap with Reaper-specific error handling
- Add LAMMPS-focused physics checks

---

## Data Flow

```
1. User Input
   ├── Intent (string): "NVT simulation of copper at 300K for 1ns"
   └── Files (optional): ["copper.data", "Cu.eam.alloy"]

2. Context Building
   ├── Read provided files
   └── Build context string with file contents

3. LLM Generation
   ├── Send prompt with context to Claude
   └── Receive complete LAMMPS input deck

4. Validation Pipeline
   ├── L0: Check for {{PLACEHOLDER}} patterns
   ├── L1: Validate LAMMPS syntax
   ├── L2: Run `lmp -in deck.in` in check mode
   └── L3: Physics sanity checks

5. Output
   ├── If valid: Return deck content
   └── If invalid: Return errors with suggestions
```

---

## Key Interfaces

### ReaperInput
```
- intent: str              # Natural language description
- files: List[Path]        # Optional input files
- output_path: Path        # Where to write output
```

### ReaperOutput
```
- success: bool            # Generation successful
- deck_content: str        # Generated LAMMPS input
- validation: ValidationResult  # L0-L3 results
- errors: List[str]        # Any error messages
```

### ValidationResult
```
- passed: bool             # All levels passed
- l0_passed: bool          # No placeholders
- l1_passed: bool          # Valid syntax
- l2_passed: bool          # Engine accepts
- l3_passed: bool          # Physics reasonable
- issues: List[str]        # Detailed issues
```

---

## Navigation

⬅️ **Previous**: [00-index.md](./00-index.md)
➡️ **Next**: [02-core.md](./02-core.md) — Core Modules
