# DevGuide v0.2.20: Dashboard Enhancement & Full API Integration

**Status:** Planning
**Author:** Claude
**Date:** 2026-01-02
**Prerequisites:** v0.2.19 (Observability & Reliability Refactor)

---

## Executive Summary

The AgentGate web dashboard currently provides basic work order and run management but only utilizes a subset of available API endpoints. This DevGuide defines a comprehensive enhancement to achieve full API coverage, add profile management, audit trail viewing, health monitoring, and polish the user experience with dark mode and responsive design.

---

## Problem Statement

### Current Limitations

1. **No Profile Management** - Users cannot create, edit, or delete harness profiles from the UI; must edit config files manually
2. **No Audit Visibility** - Cannot see what configuration was used for a specific run or track config changes over time
3. **Limited Health Insight** - Only shows basic connection status, not system health, driver status, or capacity limits
4. **No Run Control** - Cannot manually trigger a new run for an existing work order
5. **Basic Filtering** - Only status filter available; no date range, repository, or agent type filtering
6. **No Dark Mode** - Single light theme only
7. **Limited Mobile Support** - Layout breaks on smaller screens

### API Endpoints Not Used

| Endpoint | Purpose | Dashboard Gap |
|----------|---------|---------------|
| `GET /api/v1/profiles` | List all profiles | No profile UI |
| `GET /api/v1/profiles/:name` | Get profile with optional resolution | No profile detail view |
| `POST /api/v1/profiles` | Create profile | Cannot create profiles |
| `PUT /api/v1/profiles/:name` | Update profile | Cannot edit profiles |
| `DELETE /api/v1/profiles/:name` | Delete profile | Cannot delete profiles |
| `POST /api/v1/profiles/:name/validate` | Validate profile | No validation feedback |
| `GET /api/v1/work-orders/:id/audit` | Get audit records | No audit trail |
| `GET /api/v1/audit/runs/:runId` | Get run config snapshot | No config visibility |
| `POST /api/v1/work-orders/:id/runs` | Trigger new run | Cannot retry runs |
| `GET /health` | Full health status | Only partial use |
| `GET /health/ready` | Readiness check | Not used |
| `GET /health/live` | Liveness check | Not used |

---

## Success Criteria

After v0.2.20 implementation:

1. **100% API Coverage** - Every server endpoint has corresponding UI functionality
2. **Profile Management** - Full CRUD operations for harness profiles with inheritance visualization
3. **Audit Trail** - View configuration history for any work order or run
4. **Health Dashboard** - Real-time system health with driver status and capacity metrics
5. **Run Control** - Ability to trigger new runs from the UI
6. **Advanced Filtering** - Filter by date range, status, repository, and agent type
7. **Dark Mode** - User-selectable theme preference that persists
8. **Responsive Design** - Fully functional on mobile devices
9. **Accessibility** - WCAG AA compliance

---

## Thrust Overview

| # | Name | Description | Phase |
|---|------|-------------|-------|
| 1 | Profile List Page | View all profiles with inheritance tree | 1 |
| 2 | Profile Editor | Create and edit profiles with JSON config | 1 |
| 3 | Profile API Integration | React Query hooks for profile CRUD | 1 |
| 4 | Audit Trail Viewer | View configuration history per work order/run | 2 |
| 5 | Health Dashboard | System health, drivers, limits visualization | 2 |
| 6 | Enhanced Error Display | Rich error details using BuildError structure | 2 |
| 7 | Run Trigger | Manual run trigger from work order detail | 3 |
| 8 | Advanced Filters | Date range, multi-status, repo, agent type | 3 |
| 9 | Iteration Deep Dive | Full agent output and verification details | 3 |
| 10 | Responsive & Polish | Dark mode, mobile layout, accessibility | 3 |

---

## Phase Structure

### Phase 1: Profile Management (Thrusts 1-3)
Adds complete profile CRUD functionality with inheritance visualization and validation.

### Phase 2: Audit & Observability (Thrusts 4-6)
Adds configuration audit trail, system health dashboard, and enhanced error display.

### Phase 3: Run Control & UX (Thrusts 7-10)
Adds run triggering, advanced filtering, iteration details, and UI polish.

---

## Document Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Architecture, tech stack, design decisions |
| [02-profile-list.md](./02-profile-list.md) | Thrust 1: Profile list page specification |
| [03-profile-editor.md](./03-profile-editor.md) | Thrust 2: Profile editor specification |
| [04-profile-api.md](./04-profile-api.md) | Thrust 3: Profile API integration |
| [05-audit-viewer.md](./05-audit-viewer.md) | Thrust 4: Audit trail viewer |
| [06-health-dashboard.md](./06-health-dashboard.md) | Thrust 5: Health dashboard |
| [07-enhanced-errors.md](./07-enhanced-errors.md) | Thrust 6: Enhanced error display |
| [08-run-trigger.md](./08-run-trigger.md) | Thrust 7: Run trigger functionality |
| [09-advanced-filters.md](./09-advanced-filters.md) | Thrust 8: Advanced filtering |
| [10-iteration-detail.md](./10-iteration-detail.md) | Thrust 9: Iteration deep dive |
| [11-polish.md](./11-polish.md) | Thrust 10: Dark mode, responsive, a11y |
| [12-testing.md](./12-testing.md) | Testing strategy and requirements |
| [13-appendices.md](./13-appendices.md) | API schemas, glossary, references |
| [14-execution-plan.md](./14-execution-plan.md) | Implementation sequence and work orders |

---

## Dependencies

### Internal Dependencies
- v0.2.19 must be complete (provides BuildError, persisted results, audit endpoints)
- Server must be running with all API endpoints available

### External Dependencies
- No new major dependencies required
- Optional: JSON editor library for profile config editing
- Optional: Date picker library for date range filters

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Profile API schema changes | High | Validate against server schema; use Zod for runtime validation |
| Large audit histories | Medium | Implement pagination; limit displayed snapshots |
| SSE connection stability | Medium | Reuse existing streaming infrastructure from runs |
| Dark mode color conflicts | Low | Use TailwindCSS dark: variants consistently |
| Mobile layout complexity | Medium | Design mobile-first; test on multiple viewports |

---

## Out of Scope

The following are explicitly not part of v0.2.20:

1. Terminal UI (TUI) - covered in v0.2.21
2. Multi-user authentication - future consideration
3. Role-based access control - future consideration
4. Profile import/export - could be added later
5. Webhook configuration UI - server doesn't support yet
6. Custom dashboard layouts - complexity not justified
