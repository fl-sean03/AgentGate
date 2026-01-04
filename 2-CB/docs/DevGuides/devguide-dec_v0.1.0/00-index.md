# DevGuide v0.1.0 - Campaign Builder Full Implementation

**Version:** 0.1.0
**Status:** Active
**Created:** 2025-12-28
**Target:** Complete Campaign Builder from Green Field

---

## Executive Summary

This DevGuide provides comprehensive implementation instructions for building Campaign Builder from scratch. Campaign Builder is an AI-powered tool that translates natural language intent into validated, production-ready simulation input files for computational chemistry (LAMMPS and Quantum ESPRESSO).

**End Goal:** A fully functional CLI tool that accepts user intent + input files, analyzes them with parallel sub-agents, generates validated simulation input decks, and delivers production-ready files with full provenance.

---

## Quick Navigation

| File | Content | Thrusts |
|------|---------|---------|
| [01-overview.md](./01-overview.md) | Architecture, current state, target state | - |
| [02-foundation.md](./02-foundation.md) | Project setup, dependencies, structure | 1 |
| [03-schemas.md](./03-schemas.md) | FileGuide, FileType, errors | 2-3 |
| [04-tools-documents.md](./04-tools-documents.md) | PDF, Excel, CSV reading tools | 4-5 |
| [05-tools-validation.md](./05-tools-validation.md) | L0-L3 validation pipeline | 6-8 |
| [06-prompts.md](./06-prompts.md) | Agent system prompts | 9-10 |
| [07-file-analyzer.md](./07-file-analyzer.md) | FileAnalyzer sub-agent | 11-12 |
| [08-campaign-planner.md](./08-campaign-planner.md) | Campaign Planner agent | 13-14 |
| [09-orchestration.md](./09-orchestration.md) | Multi-agent orchestration | 15-16 |
| [10-cli.md](./10-cli.md) | Command-line interface | 17 |
| [11-testing.md](./11-testing.md) | Test strategy and fixtures | 18-19 |
| [12-appendices.md](./12-appendices.md) | File references, checklists | - |

---

## Thrust Summary

| # | Name | Description | Dependencies |
|---|------|-------------|--------------|
| 1 | Project Foundation | Create directory structure, pyproject.toml, install deps | None |
| 2 | FileType Enumeration | Define all supported file types | 1 |
| 3 | FileGuide Schema | Complete FileGuide dataclass with all fields | 2 |
| 4 | PDF Reading Tool | Extract text from PDF documents | 1 |
| 5 | Excel/CSV Reading Tools | Read spreadsheet and tabular data | 1 |
| 6 | L0 Validation | Template completeness checking | 1 |
| 7 | L1 Validation | Engine-specific syntax validation | 6 |
| 8 | L2-L3 Validation | Engine acceptance and physics checks | 7 |
| 9 | FileAnalyzer Prompt | System prompt for file analysis agent | 3 |
| 10 | Campaign Planner Prompt | System prompt for planning agent | 9 |
| 11 | FileAnalyzer Core | Single file analysis function | 4, 5, 9 |
| 12 | Parallel File Analysis | Analyze multiple files concurrently | 11 |
| 13 | Campaign Planner Core | Generate decks from FileGuides | 10 |
| 14 | Validation Integration | Auto-repair loop for generated decks | 8, 13 |
| 15 | Orchestration Runner | Main pipeline coordinator | 12, 14 |
| 16 | Error Handling & Degradation | Graceful failure handling | 15 |
| 17 | CLI Implementation | Click-based command interface | 15 |
| 18 | Unit & Integration Tests | Test individual components | 1-17 |
| 19 | End-to-End Testing | Full pipeline tests with fixtures | 18 |

---

## Implementation Order

Execute thrusts in numerical order. Each thrust builds on previous ones. Do not skip ahead.

```
Week 1: Foundation (Thrusts 1-5)
├── Day 1: Project setup, FileType, FileGuide
├── Day 2: Error handling, PDF tool
└── Day 3: Excel/CSV tools

Week 2: Validation (Thrusts 6-8)
├── Day 1: L0 validation
├── Day 2: L1 LAMMPS and QE validation
└── Day 3: L2-L3 validation

Week 3: Agents (Thrusts 9-14)
├── Day 1: Agent prompts
├── Day 2: FileAnalyzer implementation
├── Day 3: Campaign Planner implementation
└── Day 4: Validation integration

Week 4: Integration (Thrusts 15-19)
├── Day 1: Orchestration runner
├── Day 2: CLI implementation
└── Days 3-5: Testing and polish
```

---

## Success Criteria

The implementation is complete when:

1. **CLI works:** `campaign-builder "intent" -w ./workspace/` executes without error
2. **File analysis succeeds:** All file types (LAMMPS .data, PDF, Excel) produce valid FileGuides
3. **Deck generation works:** LAMMPS and QE input files are generated correctly
4. **Validation passes:** Generated files pass L0-L3 validation
5. **Provenance complete:** Every parameter has source citation
6. **Tests pass:** All unit, integration, and e2e tests pass
7. **Errors handled:** Graceful degradation when files fail

---

## Key Architectural Decisions

These decisions are NON-NEGOTIABLE and must be preserved:

### 1. Multi-Agent Architecture
- FileAnalyzer sub-agents analyze files in parallel
- Each produces a compact FileGuide (~50 lines from 500K line files)
- Campaign Planner sees only FileGuides, never raw data
- Context is preserved for actual reasoning

### 2. FileGuide as Contract
- Structured summary format between agents
- NEVER includes raw atom coordinates
- MUST include all force field parameters
- Has to_markdown() for LLM consumption

### 3. Never Invent Physics
- Force field parameters come from files ONLY
- Missing info is reported, never assumed
- No "typical" or "reasonable" defaults for physics

### 4. Mandatory L0-L3 Validation
- L0: No placeholders remain
- L1: Engine syntax is correct
- L2: Engine binary accepts file
- L3: Physics are reasonable

---

## Reference Documents

Read these BEFORE implementing (located in `/docs/greenfield/`):

| Document | Purpose | Read For |
|----------|---------|----------|
| README.md | Project vision | Understanding the problem |
| ARCHITECTURE.md | System design | Multi-agent flow |
| SPECIFICATION.md | Detailed schemas | FileGuide fields, error codes |
| IMPLEMENTATION_GUIDE.md | Phase details | Acceptance criteria |
| BACKGROUND.md | Domain context | Computational chemistry |
| CLAUDE.md | AI instructions | Quality standards |

---

## Completion Tracking

Update this section as thrusts are completed:

| Thrust | Status | Completed By | Report |
|--------|--------|--------------|--------|
| 1 | Complete | Claude Code | Project foundation created |
| 2 | Complete | Claude Code | FileType enum with 17 values |
| 3 | Complete | Claude Code | FileGuide dataclass complete |
| 4 | Complete | Claude Code | PDF reading tool implemented |
| 5 | Complete | Claude Code | Excel/CSV tools implemented |
| 6 | Complete | Claude Code | L0 placeholder detection |
| 7 | Complete | Claude Code | L1 LAMMPS/QE syntax validation |
| 8 | Complete | Claude Code | L2-L3 engine & physics validation |
| 9 | Complete | Claude Code | FileAnalyzer prompt created |
| 10 | Complete | Claude Code | Campaign Planner prompt created |
| 11 | Complete | Claude Code | Single file analysis function |
| 12 | Complete | Claude Code | Parallel batch analysis |
| 13 | Complete | Claude Code | Campaign planning core |
| 14 | Complete | Claude Code | Validation integration |
| 15 | Complete | Claude Code | Orchestration runner |
| 16 | Complete | Claude Code | Error handling & degradation |
| 17 | Complete | Claude Code | CLI with analyze/generate/validate |
| 18 | Complete | Claude Code | 354 unit/integration tests |
| 19 | Complete | Claude Code | End-to-end test coverage |

---

## Notes for Implementers

### For AI Agents (Claude Code)
1. Read the greenfield docs FIRST
2. Execute thrusts in order
3. Complete ALL subtasks within a thrust before moving on
4. Run verification steps after each thrust
5. Create completion reports in `reports/` directory
6. Never invent force field parameters - even in tests

### For Human Developers
1. Start with 01-overview.md to understand the architecture
2. Each thrust is designed to complete in 2-4 hours
3. Verification steps tell you if you succeeded
4. File references show exactly what to create/modify

### Quality Standards
- Type hints on all functions
- Docstrings matching behavior
- No silent failures - always report errors
- Tests for all new functionality
