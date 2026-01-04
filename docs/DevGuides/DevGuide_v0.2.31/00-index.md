# DevGuide v0.2.31: OSS/SaaS Repository Split

**Status**: Planning
**Target Version**: 0.2.31
**Theme**: Separate public open-source repository from private SaaS infrastructure

---

## Quick Navigation

| File | Description |
|------|-------------|
| [00-index.md](./00-index.md) | This file - master index |
| [01-overview.md](./01-overview.md) | Architecture, rationale, target state |
| [02-thrusts-core.md](./02-thrusts-core.md) | Thrusts 1-3: Core separation |
| [03-thrusts-migration.md](./03-thrusts-migration.md) | Thrusts 4-6: Component migration |
| [04-thrusts-cleanup.md](./04-thrusts-cleanup.md) | Thrusts 7-9: Public repo cleanup |
| [05-appendices.md](./05-appendices.md) | File inventories, checklists |

---

## Executive Summary

AgentGate has evolved to include both:
1. **Core orchestration functionality** - valuable as open-source for the community
2. **SaaS infrastructure** - credit billing, dashboards, multi-tenant features

This DevGuide separates these concerns into:
- **Public Repository (agentgate)**: Open-source, user-installable, uses user's own API keys/subscriptions
- **Private Repository (agentgate-internal)**: SaaS deployment, credit billing, customer dashboards

---

## Thrust Summary

| # | Thrust | Description | Priority |
|---|--------|-------------|----------|
| 1 | Private Repository Setup | Create agentgate-internal repo structure | High |
| 2 | Core Module Extraction | Extract shared core as importable module | High |
| 3 | SaaS Component Identification | Audit and tag all SaaS-specific code | High |
| 4 | Dashboard Migration | Move packages/dashboard to private repo | High |
| 5 | SaaS Website Migration | Move packages/web to private repo | High |
| 6 | TUI De-SaaS-ification | Update TUI to remove credit/billing references | Medium |
| 7 | Billing Module Refinement | Keep usage tracking, remove credit billing | Medium |
| 8 | Public Repo Cleanup | Remove SaaS references, update docs | Medium |
| 9 | CI/CD Separation | Set up independent CI pipelines | Low |

---

## Success Criteria

1. **Public repo** can be cloned and used standalone with user's API keys
2. **Private repo** imports core and adds SaaS layer
3. No SaaS/credit/billing language in public repo
4. Local usage tracking preserved (users want to know their token costs)
5. Clear contribution guidelines for each repo

---

## Dependencies

- v0.2.30: Billing module foundation (usage tracking, cost calculator)
- Core server module must remain stable during extraction

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking public users | Extensive testing before split |
| Sync drift between repos | Automated sync checks, shared types package |
| Missing SaaS features | Complete audit before migration |
| Configuration complexity | Clear documentation for both scenarios |

---

## Implementation Timeline

Phase 1: Preparation (Thrusts 1-3)
Phase 2: Migration (Thrusts 4-6)
Phase 3: Cleanup (Thrusts 7-9)

---

## Appendix Quick Links

- [Component Inventory](./05-appendices.md#component-inventory)
- [File Migration Checklist](./05-appendices.md#migration-checklist)
- [API Surface Changes](./05-appendices.md#api-changes)
