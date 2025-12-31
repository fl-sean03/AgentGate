# DevGuide v0.2.10: Overview

## Current State

AgentGate v0.2.9 has:
- Single-agent execution model (one work order = one agent)
- Max 5 concurrent runs (hard-coded in orchestrator)
- No parent-child work order relationships
- Manual PR merging after agent completion
- No Docker containerization

**Limitations**:
- Complex tasks require manual decomposition by the user
- No way for agents to break down tasks themselves
- Limited parallelism (5 agents max)
- Manual setup process for new developers

---

## Target State

AgentGate v0.2.10 enables:
- **Recursive agent spawning**: Any agent can spawn child agents
- **Automatic integration**: Branches merged when children complete
- **High parallelism**: 10-50+ concurrent agents with configurable limits
- **One-command deployment**: `docker-compose up` starts everything

---

## Architecture Overview

### Work Order Tree

```
Root Work Order (submitted by user)
├── Child WO 1 (spawned by root agent)
│   ├── Grandchild WO 1.1 (spawned by child 1)
│   └── Grandchild WO 1.2
├── Child WO 2
│   └── Grandchild WO 2.1
└── [Integration WO] (auto-spawned when children complete)
```

### Spawn Mechanism

Agents signal spawn intent via file:

```
.agentgate/spawn-requests.json
{
  "children": [
    { "taskPrompt": "...", "rationale": "..." },
    { "taskPrompt": "...", "rationale": "..." }
  ],
  "integrationStrategy": "merge-branches"
}
```

### Branch Strategy

Each work order gets a branch with hierarchy encoded:

```
agentgate/<root-id>/<depth>-<sibling>-<work-order-id>

Examples:
  agentgate/wo123/0-0-wo123     (root)
  agentgate/wo123/1-0-wo456     (first child)
  agentgate/wo123/1-1-wo789     (second child)
  agentgate/wo123/2-0-woABC     (grandchild of first child)
```

### Integration Flow

1. Leaf nodes complete first (no children)
2. Parent waits for all children to complete
3. Integration agent spawns to merge child branches
4. Process repeats up the tree
5. Final PR created from root's integrated branch

---

## Key Design Decisions

### Why File-Based Spawning?

- **Simplicity**: No new MCP tools or APIs needed
- **Agent-agnostic**: Works with any agent driver
- **Debuggable**: Easy to inspect spawn requests
- **Declarative**: Agent states intent, orchestrator executes

### Why Depth-First Integration?

- **Less conflict complexity**: Smaller merges at each level
- **Early failure detection**: Integration issues caught early
- **Natural progression**: Matches how humans would integrate

### Why Docker Compose?

- **One-command setup**: New developers productive immediately
- **Consistent environment**: Same setup everywhere
- **Resource isolation**: Container limits prevent resource exhaustion
- **Production-ready**: Easy path to production deployment

---

## Runaway Spawning Prevention

Multiple layers of protection:

1. **Depth limit**: Max 3 levels deep (configurable)
2. **Children limit**: Max 5 children per parent (configurable)
3. **Tree size limit**: Max 20 total work orders per tree (configurable)
4. **Validation**: Spawn requests rejected if limits exceeded
5. **Circuit breaker**: If >50% of children fail, halt remaining

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_MAX_CONCURRENT_RUNS` | 5 | Max parallel agent executions |
| `AGENTGATE_MAX_SPAWN_DEPTH` | 3 | Max tree depth |
| `AGENTGATE_MAX_CHILDREN_PER_PARENT` | 5 | Max children per work order |
| `AGENTGATE_MAX_TREE_SIZE` | 20 | Max work orders per tree |
| `AGENTGATE_PORT` | 3001 | HTTP server port |
| `SERVER_MEMORY_LIMIT` | 4G | Docker memory limit |
| `SERVER_CPU_LIMIT` | 4 | Docker CPU limit |
