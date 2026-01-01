# 07: Appendices

Checklists, troubleshooting guides, and quick references for DevGuide v0.2.16.

---

## Implementation Checklist

### Thrust 1: Harness Config Types
- [ ] Create `packages/server/src/types/harness-config.ts`
- [ ] Define `LoopStrategyMode` enum
- [ ] Define `CompletionDetection` enum
- [ ] Define `ProgressTrackingMode` enum
- [ ] Define `GitOperationMode` enum
- [ ] Define `fixedStrategyConfigSchema`
- [ ] Define `ralphStrategyConfigSchema`
- [ ] Define `hybridStrategyConfigSchema`
- [ ] Define `customStrategyConfigSchema`
- [ ] Define `loopStrategyConfigSchema` (discriminated union)
- [ ] Define `agentDriverConfigSchema`
- [ ] Define `verificationConfigSchema`
- [ ] Define `gitOpsConfigSchema`
- [ ] Define `executionLimitsSchema`
- [ ] Define `harnessConfigSchema`
- [ ] Define `ResolvedHarnessConfig` interface
- [ ] Define audit trail types
- [ ] Export all types from `types/index.ts`

### Thrust 2: Loop Strategy Types
- [ ] Create `packages/server/src/types/loop-strategy.ts`
- [ ] Define `LoopDecision` interface
- [ ] Define `LoopProgress` interface
- [ ] Define `LoopDetectionData` interface
- [ ] Define `LoopState` interface
- [ ] Define `LoopContext` interface
- [ ] Define `LoopStrategy` interface
- [ ] Define `LoopStrategyFactory` type
- [ ] Export all types from `types/index.ts`

### Thrust 3: Fixed Strategy
- [ ] Create `packages/server/src/harness/strategy-registry.ts`
- [ ] Create `packages/server/src/harness/strategies/base-strategy.ts`
- [ ] Create `packages/server/src/harness/strategies/fixed-strategy.ts`
- [ ] Create `packages/server/src/harness/strategies/index.ts`
- [ ] Create `packages/server/src/harness/index.ts`
- [ ] Register fixed strategy in registry
- [ ] Write tests for fixed strategy

### Thrust 4: Hybrid Strategy
- [ ] Create `packages/server/src/harness/strategies/hybrid-strategy.ts`
- [ ] Implement `shouldContinue` with completion criteria
- [ ] Implement `checkCriterion` for each criterion type
- [ ] Implement loop detection via hash comparison
- [ ] Implement progress tracking from verification
- [ ] Register hybrid strategy in registry
- [ ] Write tests for hybrid strategy

### Thrust 5: Ralph Strategy
- [ ] Create `packages/server/src/harness/strategies/ralph-strategy.ts`
- [ ] Implement completion signal detection
- [ ] Implement similarity-based loop detection
- [ ] Implement optional state persistence
- [ ] Register ralph strategy in registry
- [ ] Write tests for ralph strategy

### Thrust 6: Custom Strategy
- [ ] Create `packages/server/src/harness/strategies/custom-strategy.ts`
- [ ] Implement dynamic module loading
- [ ] Implement delegation to loaded strategy
- [ ] Implement error handling for invalid modules
- [ ] Register custom strategy in registry
- [ ] Write tests for custom strategy
- [ ] Create test fixture custom strategy

### Thrust 7: Config Loader
- [ ] Add `yaml` dependency to package.json
- [ ] Create `packages/server/src/harness/config-loader.ts`
- [ ] Implement `listProfiles()`
- [ ] Implement `loadProfile()`
- [ ] Implement `profileExists()`
- [ ] Implement `saveProfile()`
- [ ] Implement `ensureHarnessDir()`
- [ ] Write tests for config loader

### Thrust 8: Config Resolver
- [ ] Create `packages/server/src/harness/config-resolver.ts`
- [ ] Implement `resolveInheritance()`
- [ ] Implement `mergeConfigs()`
- [ ] Implement `applyDefaults()`
- [ ] Implement `applyCLIOverrides()`
- [ ] Implement `resolveHarnessConfig()`
- [ ] Implement `computeConfigHash()`
- [ ] Write tests for config resolver

### Thrust 9: Orchestrator Integration
- [ ] Modify `OrchestratorConfig` to accept harness config
- [ ] Add harness resolution to `Orchestrator.execute()`
- [ ] Extend `RunExecutorOptions` with harness config and strategy
- [ ] Replace fixed loop with strategy-driven loop in `executeRun()`
- [ ] Implement `buildLoopContext()` helper
- [ ] Map strategy decisions to run outcomes
- [ ] Write integration tests

### Thrust 10: CLI Integration
- [ ] Add `--harness` option to submit command
- [ ] Add `--loop-strategy` option to submit command
- [ ] Add `--completion` option to submit command
- [ ] Update validators with new options
- [ ] Create `profile` command with list/show/create/validate/delete
- [ ] Register profile command
- [ ] Update help text
- [ ] Write CLI tests

### Thrust 11: Audit Trail
- [ ] Create `packages/server/src/harness/audit-trail.ts`
- [ ] Implement `AuditStore` class
- [ ] Implement config snapshot creation
- [ ] Implement change detection
- [ ] Implement snapshot persistence
- [ ] Implement audit record management
- [ ] Integrate with run executor
- [ ] Add audit query commands (optional)
- [ ] Write tests for audit trail

### Thrust 12: Testing & Default Profiles
- [ ] Create all test files as specified
- [ ] Create test fixtures
- [ ] Create `default.yaml` profile
- [ ] Create `ci-focused.yaml` profile
- [ ] Create `rapid-iteration.yaml` profile
- [ ] Create `ralph-style.yaml` profile
- [ ] Verify test coverage meets requirements
- [ ] Run full test suite

---

## File Reference

### New Files (23 files)

| Path | Thrust |
|------|--------|
| `packages/server/src/types/harness-config.ts` | 1 |
| `packages/server/src/types/loop-strategy.ts` | 2 |
| `packages/server/src/harness/index.ts` | 3 |
| `packages/server/src/harness/strategy-registry.ts` | 3 |
| `packages/server/src/harness/strategies/index.ts` | 3 |
| `packages/server/src/harness/strategies/base-strategy.ts` | 3 |
| `packages/server/src/harness/strategies/fixed-strategy.ts` | 3 |
| `packages/server/src/harness/strategies/hybrid-strategy.ts` | 4 |
| `packages/server/src/harness/strategies/ralph-strategy.ts` | 5 |
| `packages/server/src/harness/strategies/custom-strategy.ts` | 6 |
| `packages/server/src/harness/config-loader.ts` | 7 |
| `packages/server/src/harness/config-resolver.ts` | 8 |
| `packages/server/src/harness/config-store.ts` | 8 |
| `packages/server/src/harness/audit-trail.ts` | 11 |
| `packages/server/src/control-plane/commands/profile.ts` | 10 |
| `packages/server/test/harness/harness-config.test.ts` | 12 |
| `packages/server/test/harness/strategies/*.test.ts` | 12 |
| `packages/server/test/harness/config-loader.test.ts` | 12 |
| `packages/server/test/harness/config-resolver.test.ts` | 12 |
| `packages/server/test/harness/strategy-registry.test.ts` | 12 |
| `packages/server/test/harness/integration.test.ts` | 12 |
| `packages/server/test/harness/cli.test.ts` | 12 |
| `packages/server/test/fixtures/harness/*.yaml` | 12 |

### Modified Files (7 files)

| Path | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/types/index.ts` | 1-2 | Export new types |
| `packages/server/package.json` | 7 | Add yaml dependency |
| `packages/server/src/orchestrator/orchestrator.ts` | 9 | Harness integration |
| `packages/server/src/orchestrator/run-executor.ts` | 9, 11 | Strategy loop, audit |
| `packages/server/src/control-plane/commands/submit.ts` | 10 | New options |
| `packages/server/src/control-plane/commands/index.ts` | 10 | Register profile |
| `packages/server/src/control-plane/validators.ts` | 10 | New schemas |

---

## Troubleshooting Guide

### Profile Not Found

**Symptom:** `Error: Profile 'xyz' not found`

**Solutions:**
1. Check profile exists: `ls ~/.agentgate/harnesses/`
2. Verify spelling matches exactly (case-sensitive)
3. Ensure `.yaml` extension is not included in `--harness`
4. Run `agentgate profile list` to see available profiles

### Inheritance Cycle Detected

**Symptom:** `Error: Circular inheritance detected: a -> b -> c -> a`

**Solutions:**
1. Review `extends` fields in all profiles in the chain
2. Remove the circular reference
3. Use a common base profile instead of circular references

### Strategy Not Continuing

**Symptom:** Run stops after one iteration when it should continue

**Solutions:**
1. Check `maxIterations` setting (may be set to 1)
2. For hybrid, check if verification passed (triggers completion)
3. For ralph, check if agent output contains completion signal
4. Enable debug logging to see strategy decisions

### Config Hash Mismatch

**Symptom:** Audit trail shows different config hashes for same config

**Solutions:**
1. Ensure JSON serialization is deterministic (sorted keys)
2. Check for floating-point precision issues
3. Verify Date fields are serialized consistently

### Custom Strategy Load Failure

**Symptom:** `Error: Cannot load custom strategy from 'path'`

**Solutions:**
1. Verify module path is correct (absolute or relative to workspace)
2. Check module exports the expected function/class
3. Ensure strategy name matches export name
4. Verify module has no syntax errors

---

## Quick Reference

### CLI Options Summary

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--harness` | string | - | Named profile from ~/.agentgate/harnesses/ |
| `--loop-strategy` | enum | hybrid | fixed, hybrid, ralph, custom |
| `--completion` | string[] | - | Comma-separated completion criteria |
| `--max-iterations` | number | 5 | Max iterations (overrides profile) |
| `--wait-for-ci` | boolean | false | Wait for CI after PR |

### Completion Criteria

| Criterion | Description |
|-----------|-------------|
| `verification-pass` | All required verification levels pass |
| `ci-pass` | CI checks pass after PR |
| `no-changes` | No code changes between iterations |
| `agent-signal` | Agent output contains completion signal |
| `loop-detection` | Output similarity indicates loop |

### Verification Levels

| Level | Description |
|-------|-------------|
| L0 | Contract validation (forbidden patterns, required files) |
| L1 | Unit tests pass |
| L2 | Blackbox/integration tests pass |
| L3 | Sanity checks pass |

### Profile Commands

```bash
agentgate profile list                    # List all profiles
agentgate profile show <name>             # Show profile details
agentgate profile create <name>           # Create new profile
agentgate profile validate <path>         # Validate profile file
agentgate profile delete <name>           # Delete profile
```

---

## Sources & References

### Research

- [Ralph Wiggum Loop](https://ghuntley.com/ralph/) - Geoffrey Huntley
- [Ralph Orchestrator](https://github.com/mikeyobrien/ralph-orchestrator) - mikeyobrien
- [Anthropic Harness Design](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Claude Code Configuration](https://arxiv.org/html/2511.09268) - arXiv paper

### Related DevGuides

- [v0.2.15](../DevGuide_v0.2.15/00-index.md) - CI/CD System
- [v0.2.14](../DevGuide_v0.2.14/00-index.md) - Claude Agent SDK Integration
- [v0.2.12](../DevGuide_v0.2.12/00-index.md) - GitHub CI Feedback Loop

### Internal References

- `packages/server/src/orchestrator/orchestrator.ts` - Main orchestrator
- `packages/server/src/orchestrator/run-executor.ts` - Run execution
- `packages/server/src/control-plane/commands/submit.ts` - Submit CLI
- `packages/server/src/types/work-order.ts` - Work order types
