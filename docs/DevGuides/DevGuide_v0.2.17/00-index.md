# 00: Index - Comprehensive API Extension

## DevGuide v0.2.17

**Title:** Comprehensive API Extension
**Status:** Not Started (Blocked by v0.2.16)
**Prerequisites:** v0.2.16 (Work Order Harness Configuration)

---

## Executive Summary

Extend the AgentGate HTTP API to provide full functionality parity with the CLI, enabling programmatic control of all features including harness profiles, loop strategies, verification settings, and audit trails.

---

## Problem Statement

The current API (`/api/v1/work-orders`) is limited:

| Feature | CLI Support | API Support |
|---------|-------------|-------------|
| Submit work order | Yes | Yes (basic) |
| Harness profiles | Yes | No |
| Loop strategy selection | Yes | No |
| Wait for CI | Yes | No |
| Skip verification levels | Yes | No |
| Max iterations/time | Yes | Partial |
| Audit trail queries | Yes | No |
| Profile management | Yes | No |
| Run streaming | Yes | No |

---

## Target API Endpoints

### Work Orders (Extended)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/work-orders` | Submit with full options |
| GET | `/api/v1/work-orders/:id/audit` | Get config audit trail |
| GET | `/api/v1/work-orders/:id/stream` | SSE stream of run events |

### Harness Profiles

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/profiles` | List available profiles |
| GET | `/api/v1/profiles/:name` | Get profile details |
| POST | `/api/v1/profiles` | Create new profile |
| PUT | `/api/v1/profiles/:name` | Update profile |
| DELETE | `/api/v1/profiles/:name` | Delete profile |

### Runs (Extended)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/runs/:id/config` | Get resolved harness config |
| GET | `/api/v1/runs/:id/strategy-state` | Get loop strategy state |
| GET | `/api/v1/runs/:id/stream` | SSE stream of run events |

---

## Thrust Overview

| # | Name | Description |
|---|------|-------------|
| 1 | Extended Work Order Schema | Add all CLI options to API |
| 2 | Profile CRUD API | Full profile management |
| 3 | Audit Trail API | Query config audit data |
| 4 | Run Streaming API | SSE for real-time updates |
| 5 | API Documentation | OpenAPI/Swagger spec |
| 6 | API Client SDK | TypeScript client library |

---

## Notes

This DevGuide will be fully specified after v0.2.16 implementation completes, as the harness configuration system must exist before the API can expose it.
