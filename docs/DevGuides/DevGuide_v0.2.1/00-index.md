# DevGuide v0.2.1: Multi-Agent Driver Support

**Status**: In Progress
**Created**: 2025-12-30
**Target**: Add OpenAI Codex SDK and OpenAI Agents SDK drivers

---

## Executive Summary

This DevGuide adds support for multiple AI coding agent backends beyond Claude. By implementing the OpenAI Codex SDK and OpenAI Agents SDK drivers, AgentGate becomes provider-agnostic, allowing users to choose the best agent for their use case.

---

## Success Criteria

1. OpenAI Codex SDK driver passes E2E test creating calculator.ts
2. OpenAI Agents SDK driver passes E2E test with custom tool
3. All existing tests continue to pass
4. Driver registry supports dynamic selection
5. Environment variables configure API keys for each provider

---

## New Agent Drivers

| Driver | Package | Use Case | Model |
|--------|---------|----------|-------|
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | Code tasks (existing) | claude-* |
| OpenAI Codex SDK | `@openai/codex-sdk` | Code tasks | gpt-5.2-codex |
| OpenAI Agents SDK | `@openai/agents` | General agent workflows | gpt-4o, o3, etc. |

---

## Thrust Summary

| # | Thrust | Description |
|---|--------|-------------|
| 1 | Install Dependencies | Add OpenAI SDK packages |
| 2 | OpenAI Codex Driver | Implement driver using Codex SDK |
| 3 | OpenAI Agents Driver | Implement driver using Agents SDK |
| 4 | Update Registry | Auto-register all available drivers |
| 5 | Environment Config | Configure API keys from .env |
| 6 | Tests | Unit tests for new drivers |
| 7 | E2E Validation | Live tests with real API calls |

---

## File Map

### New Files
- `src/agent/openai-codex-driver.ts` - Codex SDK driver
- `src/agent/openai-agents-driver.ts` - Agents SDK driver
- `test/openai-codex-driver.test.ts` - Codex driver tests
- `test/openai-agents-driver.test.ts` - Agents driver tests
- `scripts/live-codex-test.ts` - Live E2E test for Codex
- `scripts/live-agents-test.ts` - Live E2E test for Agents SDK

### Modified Files
- `package.json` - Add new dependencies
- `src/agent/index.ts` - Export new drivers
- `src/agent/defaults.ts` - Add driver-specific defaults

---

## Navigation

- [01-overview.md](./01-overview.md) - Architecture and API comparison
- [02-implementation.md](./02-implementation.md) - Detailed thrust specifications
- [03-appendices.md](./03-appendices.md) - API references and checklists
