# Appendices

## A. Implementation Checklist

### Phase 1: Core Foundation
- [ ] Thrust 1: Package Structure
  - [ ] 1.2.1 Create package directory
  - [ ] 1.2.2 Create __init__.py
  - [ ] 1.2.3 Create module files
  - [ ] 1.2.4 Create validation subpackage
- [ ] Thrust 2: Schema Definitions
  - [ ] 2.2.1 Define ReaperInput
  - [ ] 2.2.2 Define ReaperOutput
  - [ ] 2.2.3 Define ValidationResult
  - [ ] 2.2.4 Define level results
  - [ ] 2.2.5 Define FileContext

### Phase 2: LLM Integration
- [ ] Thrust 3: Provider Setup
  - [ ] 3.2.1 Create AnthropicProvider
  - [ ] 3.2.2 Implement retry logic
  - [ ] 3.2.3 Implement message creation
  - [ ] 3.2.4 Add health check
- [ ] Thrust 4: Generation Logic
  - [ ] 4.2.1 Create system prompt
  - [ ] 4.2.2 Implement context builder
  - [ ] 4.2.3 Implement prompt builder
  - [ ] 4.2.4 Implement generate_deck
  - [ ] 4.2.5 Implement post-processing

### Phase 3: Validation
- [ ] Thrust 5: L0-L1 Validators
  - [ ] 5.2.1 Implement L0 placeholder detection
  - [ ] 5.2.2 Implement L1 syntax validation
  - [ ] 5.2.3 Add required command checks
  - [ ] 5.2.4 Add syntax error detection
- [ ] Thrust 6: L2-L3 Validators
  - [ ] 6.2.1 Implement L2 engine check
  - [ ] 6.2.2 Add LAMMPS binary detection
  - [ ] 6.2.3 Implement L3 physics checks
  - [ ] 6.2.4 Add unit-aware checks
  - [ ] 6.2.5 Create unified validator

### Phase 4: Testing
- [ ] Thrust 7: Unit Tests
  - [ ] 7.2.1 Create test directory
  - [ ] 7.2.2 Implement schema tests
  - [ ] 7.2.3 Implement provider tests
  - [ ] 7.2.4 Implement generator tests
  - [ ] 7.2.5 Implement validation tests
- [ ] Thrust 8: Live API Tests
  - [ ] 8.2.1 Create live test file
  - [ ] 8.2.2 Provider connectivity test
  - [ ] 8.2.3 Generation test
  - [ ] 8.2.4 Full pipeline test
  - [ ] 8.2.5 Context test
  - [ ] 8.2.6 LAMMPS execution test

---

## B. File Inventory

### Core Package
| File | Purpose | LOC Target |
|------|---------|------------|
| `lammps_reaper/__init__.py` | Public API exports | 20 |
| `lammps_reaper/schemas.py` | Data classes | 100 |
| `lammps_reaper/provider.py` | Anthropic client | 80 |
| `lammps_reaper/generator.py` | Deck generation | 150 |
| `lammps_reaper/cli.py` | CLI interface | 50 |

### Validation Subpackage
| File | Purpose | LOC Target |
|------|---------|------------|
| `lammps_reaper/validation/__init__.py` | Unified validator | 50 |
| `lammps_reaper/validation/l0_placeholders.py` | Placeholder check | 40 |
| `lammps_reaper/validation/l1_syntax.py` | Syntax validation | 80 |
| `lammps_reaper/validation/l2_engine.py` | Engine check | 60 |
| `lammps_reaper/validation/l3_physics.py` | Physics validation | 80 |

### Tests
| File | Purpose | LOC Target |
|------|---------|------------|
| `tests/reaper/conftest.py` | Fixtures | 30 |
| `tests/reaper/test_schemas.py` | Schema tests | 60 |
| `tests/reaper/test_provider.py` | Provider tests | 80 |
| `tests/reaper/test_generator.py` | Generator tests | 100 |
| `tests/reaper/test_validation.py` | Validation tests | 120 |
| `tests/reaper/test_live_api.py` | Live API tests | 100 |

**Total Target: ~1,000 lines**

---

## C. LAMMPS Command Reference

### Required Commands
| Command | Purpose |
|---------|---------|
| `units` | Set unit system |
| `atom_style` | Define atom attributes |
| `boundary` | Set boundary conditions |

### Structure Commands (one required)
| Command | Purpose |
|---------|---------|
| `read_data` | Read from data file |
| `read_restart` | Read from restart |
| `create_box` | Create simulation box |

### Force Field Commands
| Command | Purpose |
|---------|---------|
| `pair_style` | Define pair potential |
| `pair_coeff` | Set pair coefficients |
| `bond_style` | Define bond potential |
| `angle_style` | Define angle potential |

### Dynamics Commands
| Command | Purpose |
|---------|---------|
| `fix` | Apply constraint/integrator |
| `run` | Execute timesteps |
| `minimize` | Energy minimization |

---

## D. Unit System Reference

### Timestep Ranges
| Units | Typical | Warning Range |
|-------|---------|---------------|
| `lj` | 0.001-0.01 | <0.0001, >0.1 |
| `real` | 0.5-2.0 fs | <0.1, >10 |
| `metal` | 0.001-0.002 ps | <0.0001, >0.01 |
| `si` | 1e-15 s | <1e-18, >1e-12 |

### Temperature Ranges
| Units | Typical | Warning Range |
|-------|---------|---------------|
| `lj` | 0.1-5.0 | <0.01, >100 |
| `real/metal` | 1-1000 K | <0.1, >5000 |

---

## E. Validation Gate Summary

| Level | Name | Purpose | What It Checks |
|-------|------|---------|----------------|
| L0 | Placeholder | Template validation | {{VAR}}, <PLACEHOLDER>, TODO:, FIXME: |
| L1 | Syntax + Physics | Static analysis | Commands, structure, timestep ranges, temperature |
| L2 | Engine Acceptance | Zero-step run | LAMMPS accepts input, no initialization errors |
| L3 | Minimal Execution | 20-step run | Force fields work, no explosions, stable dynamics |

## F. Error Codes

| Code | Level | Description |
|------|-------|-------------|
| L0-001 | L0 | Handlebars placeholder found |
| L0-002 | L0 | TODO/FIXME marker found |
| L1-001 | L1 | Missing required command |
| L1-002 | L1 | Invalid command syntax |
| L1-003 | L1 | Command ordering error |
| L1-004 | L1 | Extreme timestep value |
| L1-005 | L1 | Negative temperature |
| L2-001 | L2 | LAMMPS binary not found |
| L2-002 | L2 | Engine rejected input |
| L3-001 | L3 | Execution timeout |
| L3-002 | L3 | Lost atoms (explosion) |
| L3-003 | L3 | Non-zero return code |

---

## Navigation

⬅️ **Previous**: [05-testing.md](./05-testing.md)
🏠 **Index**: [00-index.md](./00-index.md)
