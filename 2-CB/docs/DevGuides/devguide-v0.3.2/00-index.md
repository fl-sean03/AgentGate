# DevGuide v0.3.2: LAMMPS Reaper

**A minimal, focused LAMMPS input deck generator.**

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| **Version** | 0.3.2 |
| **Status** | Ready for Implementation |
| **Focus** | LAMMPS-only input generation |
| **Scope** | Minimal viable product |
| **Location** | `lammps_reaper/` (new package) |

---

## What is Reaper?

**Reaper** is a streamlined, LAMMPS-focused tool that:

1. Takes **natural language intent** (e.g., "NVT simulation of copper at 300K")
2. Accepts **optional input files** (data files, parameter files)
3. Uses **LLM to generate** complete LAMMPS input decks
4. **Validates** through L0-L3 pipeline
5. **Outputs** production-ready `.in` files

Unlike Campaign Builder, Reaper is:
- **Single-engine**: LAMMPS only, no QE support
- **Minimal**: ~500 lines of core code
- **Focused**: No campaign planning, just deck generation
- **Fast**: Direct generation without multi-agent orchestration

---

## Document Index

| File | Purpose | Thrusts |
|------|---------|---------|
| [01-overview.md](./01-overview.md) | Architecture, design principles | — |
| [02-core.md](./02-core.md) | Core modules and schemas | 1-2 |
| [03-agent.md](./03-agent.md) | LLM integration | 3-4 |
| [04-validation.md](./04-validation.md) | Validation pipeline | 5-6 |
| [05-testing.md](./05-testing.md) | Test suite and live API | 7-8 |
| [06-appendices.md](./06-appendices.md) | Checklists, file inventory | — |

---

## Thrust Overview

### Phase 1: Core Foundation
| Thrust | Name | Description |
|--------|------|-------------|
| 1 | Package Structure | Create `lammps_reaper/` with minimal structure |
| 2 | Schema Definitions | Define input/output dataclasses |

### Phase 2: LLM Integration
| Thrust | Name | Description |
|--------|------|-------------|
| 3 | Provider Setup | Anthropic adapter with tool support |
| 4 | Generation Logic | LAMMPS deck generation with LLM |

### Phase 3: Validation
| Thrust | Name | Description |
|--------|------|-------------|
| 5 | L0-L1 Validators | Placeholder and syntax checks |
| 6 | L2-L3 Validators | Engine and physics checks |

### Phase 4: Testing
| Thrust | Name | Description |
|--------|------|-------------|
| 7 | Unit Tests | Core functionality tests |
| 8 | Live API Tests | Real Anthropic API + LAMMPS execution |

---

## Success Criteria

1. **Generate valid LAMMPS input** from natural language
2. **Pass L0-L3 validation** on generated decks
3. **Execute successfully** with real LAMMPS binary
4. **100% test coverage** on core modules
5. **Live API tests passing** with Anthropic

---

## File Structure Target

```
lammps_reaper/
├── __init__.py
├── schemas.py          # Input/output dataclasses
├── provider.py         # Anthropic LLM provider
├── generator.py        # LAMMPS deck generation
├── validation/
│   ├── __init__.py
│   ├── l0_placeholders.py
│   ├── l1_syntax.py
│   ├── l2_engine.py
│   └── l3_physics.py
└── cli.py              # Simple CLI interface

tests/
├── test_schemas.py
├── test_generator.py
├── test_validation.py
└── test_live_api.py
```

---

## Dependencies

- `anthropic` - LLM API client
- `pydantic` - Data validation
- LAMMPS binary (for L2 validation)

---

## Navigation

➡️ **Next**: [01-overview.md](./01-overview.md) — Architecture Overview
