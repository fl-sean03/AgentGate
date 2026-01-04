# DevGuide v0.3.1: Testing, Validation & Production Hardening

**Version**: 0.3.1
**Status**: Ready for Implementation
**Predecessor**: [devguide-v0.3.0](../devguide-v0.3.0/00-index.md)
**Focus**: Complete testing coverage, validation integration, and production readiness

---

## Executive Summary

DevGuide v0.3.0 established the Agent Abstraction Layer with provider adapters, tool registry, LLM-powered analyzers, and reliability patterns. This guide (v0.3.1) focuses on:

1. **Comprehensive End-to-End Testing** - Real API verification tests
2. **Validation Integration** - Connect L0-L3 validators to agent tools
3. **Streaming Event Fixes** - Standardize streaming event types
4. **Optional Dependency Handling** - Graceful PDF/Excel library fallbacks
5. **Production Hardening** - Final polish for production deployment

---

## Success Criteria

Before v0.3.1 is complete:

- [ ] All 400+ tests pass (currently 379 pass, 5 fail due to missing deps)
- [ ] Real API tests verify all agent functionality
- [ ] L0-L3 validation integrated with agent tool wrappers
- [ ] Streaming events work consistently across adapters
- [ ] Optional dependencies handled gracefully (PyMuPDF, openpyxl)
- [ ] Integration test fixtures created for polymer/silicon examples

---

## Thrust Overview

| Phase | Thrust | Description | Files |
|-------|--------|-------------|-------|
| **1: Testing** | 1 | Real API Verification Suite | `tests/test_api_live.py` |
| **1: Testing** | 2 | Optional Dependency Handling | `tests/test_tools_documents.py` |
| **2: Validation** | 3 | Agent Tool Validation Wrappers | `agent/tools/validation.py` |
| **2: Validation** | 4 | End-to-End Validation Pipeline | `tests/test_validation_e2e.py` |
| **3: Streaming** | 5 | Standardize Streaming Events | `agent/adapters/anthropic_raw.py` |
| **3: Streaming** | 6 | Streaming Integration Tests | `tests/test_streaming.py` |
| **4: Integration** | 7 | Integration Test Fixtures | `tests/fixtures/integration/` |
| **4: Integration** | 8 | CLI Command Tests | `tests/test_cli_integration.py` |
| **5: Polish** | 9 | Error Message Standardization | `agent/errors.py` |
| **5: Polish** | 10 | Health Check Implementation | `agent/health.py` |

---

## Document Structure

| Document | Thrusts | Description |
|----------|---------|-------------|
| [01-overview.md](./01-overview.md) | - | Current state, gaps, target architecture |
| [02-testing.md](./02-testing.md) | 1-2 | API verification and dependency handling |
| [03-validation.md](./03-validation.md) | 3-4 | Validation integration with agents |
| [04-streaming.md](./04-streaming.md) | 5-6 | Streaming event standardization |
| [05-integration.md](./05-integration.md) | 7-8 | Integration tests and CLI verification |
| [06-polish.md](./06-polish.md) | 9-10 | Error handling and health checks |
| [07-appendices.md](./07-appendices.md) | - | Checklists, file inventory, verification |

---

## Quick Start

1. Read [01-overview.md](./01-overview.md) for context
2. Execute thrusts 1-10 sequentially
3. Run verification after each thrust
4. Update checklist in [07-appendices.md](./07-appendices.md)

---

## Dependencies

This DevGuide builds on v0.3.0 and requires:

- All v0.3.0 components implemented
- Anthropic API key configured in `.env`
- Python 3.11+ with virtual environment
- pytest, pytest-asyncio installed

---

## Navigation

- **Next**: [01-overview.md](./01-overview.md)
- **Previous Version**: [devguide-v0.3.0](../devguide-v0.3.0/00-index.md)
