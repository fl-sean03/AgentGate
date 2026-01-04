# DevGuide v0.3.0: LLM-Native Agent Architecture

**Version:** 0.3.0
**Status:** Planning
**Created:** 2025-12-28
**Breaking Change:** Yes - Full architecture remake

---

## Executive Summary

This DevGuide transforms Campaign Builder from a deterministic parser-based system to a true **LLM-native, natural language-first** agent architecture. The core change is introducing a **Provider Abstraction Layer** that enables swapping between different agent backends (Claude Agent SDK, raw Anthropic SDK, future providers) while keeping all business logic unchanged.

**The Shift:**
- **FROM:** Hardcoded parsing functions that extract data from files using regex
- **TO:** LLM agents that understand file contents semantically and generate structured output

**Why v0.3.0 (not v0.2.0)?**
This is a complete architectural remake. The v0.1.0 implementation built the schemas, tools, and CLI infrastructure. v0.3.0 replaces the core "brain" - how the system actually analyzes files and generates campaigns.

---

## Success Criteria

1. FileAnalyzer uses Claude to analyze files and produce FileGuides
2. CampaignPlanner uses Claude to generate validated simulation input decks
3. Agent provider can be swapped via configuration (no code changes)
4. All 354+ existing tests continue to pass
5. New integration tests verify LLM-powered analysis
6. System gracefully degrades when API is unavailable

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Campaign Builder CLI                       │
│           (analyze, generate, validate commands)            │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 Agent Orchestration                          │
│        (FileAnalyzer, CampaignPlanner, Runner)              │
└────────────────────────┬────────────────────────────────────┘
                         │ Uses AgentProvider interface
┌────────────────────────▼────────────────────────────────────┐
│              Agent Provider Interface                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  run(prompt, system_prompt, tools) -> AgentResult   │    │
│  │  stream(prompt, system_prompt, tools) -> Iterator   │    │
│  │  register_tool(definition) -> None                  │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │ Implements
         ┌───────────────┼───────────────┬──────────────┐
         ▼               ▼               ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌───────────┐  ┌───────────┐
│ Claude SDK  │  │  Anthropic  │  │   Mock    │  │  Future   │
│  Adapter    │  │   Adapter   │  │  Adapter  │  │  Adapter  │
│             │  │(raw + loop) │  │ (testing) │  │           │
└─────────────┘  └─────────────┘  └───────────┘  └───────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Registry                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ read_pdf │ │read_excel│ │ validate │ │  glob    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Thrust Overview

### Phase 1: Foundation (Thrusts 1-3)
Build the abstraction layer that makes agent backends swappable.

| Thrust | Name | Description |
|--------|------|-------------|
| 1 | Agent Interface | Define abstract AgentProvider class and result types |
| 2 | Tool Definition System | Create ToolDefinition dataclass and registry |
| 3 | Configuration & Factory | Environment-based provider selection |

### Phase 2: Adapters (Thrusts 4-6)
Implement concrete adapters for different agent backends.

| Thrust | Name | Description |
|--------|------|-------------|
| 4 | Claude Agent SDK Adapter | Primary adapter using official SDK |
| 5 | Anthropic Raw Adapter | Fallback with manual tool loop |
| 6 | Mock Adapter | Deterministic responses for testing |

### Phase 3: Tool Migration (Thrusts 7-9)
Convert existing tool implementations to the new registration system.

| Thrust | Name | Description |
|--------|------|-------------|
| 7 | Document Tools | Register PDF, Excel, CSV readers |
| 8 | Validation Tools | Register L0-L3 validators |
| 9 | Utility Tools | Register glob, read, write utilities |

### Phase 4: Agent Refactoring (Thrusts 10-11)
Replace deterministic parsing with LLM-powered analysis.

| Thrust | Name | Description |
|--------|------|-------------|
| 10 | FileAnalyzer LLM | Integrate LLM for file analysis |
| 11 | CampaignPlanner LLM | Integrate LLM for campaign generation |

### Phase 5: Integration (Thrusts 12-13)
End-to-end testing and production hardening.

| Thrust | Name | Description |
|--------|------|-------------|
| 12 | End-to-End Integration | Full pipeline testing with real LLM |
| 13 | Reliability & Fallback | Error handling, retries, graceful degradation |

---

## File Map

### New Files to Create

| File | Purpose |
|------|---------|
| `campaign_builder/agent/interface.py` | Abstract AgentProvider, ToolDefinition, AgentResult |
| `campaign_builder/agent/registry.py` | Tool registry and discovery |
| `campaign_builder/agent/factory.py` | Provider factory with config-based selection |
| `campaign_builder/agent/adapters/__init__.py` | Adapters package |
| `campaign_builder/agent/adapters/claude_sdk.py` | Claude Agent SDK adapter |
| `campaign_builder/agent/adapters/anthropic_raw.py` | Raw Anthropic SDK adapter |
| `campaign_builder/agent/adapters/mock.py` | Mock adapter for testing |
| `tests/test_agent_interface.py` | Interface and adapter tests |
| `tests/test_agent_integration.py` | LLM integration tests |

### Files to Modify

| File | Changes |
|------|---------|
| `campaign_builder/agent/file_analyzer.py` | Use AgentProvider instead of local parsing |
| `campaign_builder/agent/campaign_planner.py` | Use AgentProvider for generation |
| `campaign_builder/agent/runner.py` | Inject provider via configuration |
| `campaign_builder/cli.py` | Add provider selection flag |
| `pyproject.toml` | Add anthropic dependency, update claude-agent-sdk |
| `.env` | Add AGENT_PROVIDER configuration |

---

## Environment Configuration

The following environment variables control agent behavior:

```bash
# .env file
ANTHROPIC_API_KEY=sk-ant-...        # Required for LLM providers
AGENT_PROVIDER=claude_sdk           # claude_sdk | anthropic | mock
CLAUDE_MODEL=claude-sonnet-4-20250514  # Model to use
AGENT_MAX_ITERATIONS=10             # Max tool-calling iterations
AGENT_TIMEOUT=120                   # Timeout in seconds
```

---

## Verified Test Results

The following tests were performed on 2025-12-28 to validate the approach:

### Claude Agent SDK - Basic Query
```
✓ Basic query returns correct response
✓ SystemMessage, AssistantMessage, ResultMessage flow works
```

### Claude Agent SDK - Built-in Tools
```
✓ Read tool successfully reads /tmp/test_workspace/test.data
✓ Agent correctly identifies 20 atoms from file content
✓ Tool calls visible in message stream
```

### Raw Anthropic SDK - Custom Tool Loop
```
✓ Custom read_file tool executes successfully
✓ Agentic loop completes in 2 iterations
✓ Agent correctly counts atoms from file content
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| claude-agent-sdk | 0.1.18+ | Primary agent SDK |
| anthropic | 0.75.0+ | Raw API access for fallback |
| python-dotenv | 1.0+ | Environment configuration |

---

## Navigation

| Document | Content |
|----------|---------|
| [01-overview.md](./01-overview.md) | Detailed architecture and design decisions |
| [02-foundation.md](./02-foundation.md) | Thrusts 1-3: Interface, Tools, Factory |
| [03-adapters.md](./03-adapters.md) | Thrusts 4-6: SDK, Raw, Mock adapters |
| [04-tools.md](./04-tools.md) | Thrusts 7-9: Tool migration |
| [05-agents.md](./05-agents.md) | Thrusts 10-11: LLM integration |
| [06-integration.md](./06-integration.md) | Thrusts 12-13: Testing and reliability |
| [07-appendices.md](./07-appendices.md) | Checklists, references, examples |

---

## Completion Tracking

| Thrust | Status | Implementer | Report |
|--------|--------|-------------|--------|
| 1 | Pending | - | - |
| 2 | Pending | - | - |
| 3 | Pending | - | - |
| 4 | Pending | - | - |
| 5 | Pending | - | - |
| 6 | Pending | - | - |
| 7 | Pending | - | - |
| 8 | Pending | - | - |
| 9 | Pending | - | - |
| 10 | Pending | - | - |
| 11 | Pending | - | - |
| 12 | Pending | - | - |
| 13 | Pending | - | - |

---

## Quick Start for Implementers

1. Read this index completely
2. Read `01-overview.md` for architecture understanding
3. Execute thrusts in order (they build on each other)
4. Run verification steps after each thrust
5. Create completion reports in `reports/` directory
6. Update the tracking table above

**Important:** Each thrust is designed to be completable in a single session (2-4 hours). Do not skip thrusts or complete them out of order.
