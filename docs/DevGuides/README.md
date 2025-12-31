# DevGuides

**A structured approach to evolving codebases through versioned implementation guides.**

---

## Philosophy

DevGuides solve a fundamental problem in software development: **how do you make large, complex changes to a codebase without losing context, breaking functionality, or creating inconsistencies?**

Traditional approaches fail because:
- **Single PR descriptions** lack the depth needed for architectural changes
- **Wiki pages** become stale and disconnected from implementation
- **Oral knowledge transfer** doesn't scale and creates bus factors
- **Ticket descriptions** are scattered across multiple issues
- **LLM context windows** limit how much an AI coding agent can hold at once

DevGuides are **implementation-ready technical specifications** designed for:
1. **AI coding agents** with excellent skills but limited working memory
2. **Junior developers** who need clear, step-by-step guidance
3. **Future maintainers** who need to understand why things were built a certain way
4. **Code reviewers** who need context for what's being changed

---

## Core Principles

### 1. Self-Contained Thrusts

Each major change is broken into **thrusts** — focused units of work that:
- Can be completed in a single session (2-4 hours)
- Have clear verification steps
- Don't require external context to understand
- Build incrementally on previous thrusts
- Won't break existing functionality if done correctly

### 2. No Pseudocode, No Code Blocks

DevGuides describe **what** to build and **why**, not **how** to write the code. This is intentional:
- Code in docs becomes stale immediately
- Skilled developers/agents can write the implementation
- Focus on architecture, patterns, and intent
- Implementation details belong in the actual codebase

### 3. Explicit File References

Every thrust specifies:
- Which files to create
- Which files to modify
- What changes to make
- How to verify changes work

This eliminates ambiguity and enables automation.

### 4. Versioned Progression

DevGuides are **versioned directories**, not single documents:

```
docs/DevGuides/
├── README.md                    # This file - explains the system
├── DevGuide_v0.1.0/            # First implementation guide
│   ├── 00-index.md
│   ├── 01-overview.md
│   └── ...
├── DevGuide_v0.1.1/            # Next iteration
└── DevGuide_v0.2.0/            # Major version bump
```

Version numbering follows semantic principles:
- **v0.1.0 → v0.1.1**: Minor improvements, bug fixes, small features
- **v0.1.x → v0.2.0**: Significant new capability or architectural change
- **v0.x.x → v1.0.0**: Production-ready milestone

---

## DevGuide Structure

Each DevGuide is a **directory** containing multiple markdown files:

| File | Purpose |
|------|---------|
| `00-index.md` | Master index, navigation, quick reference |
| `01-overview.md` | Executive summary, current state, target architecture |
| `02-*.md` ... `0N-*.md` | Individual thrusts grouped by theme |
| `*-appendices.md` | File references, checklists, diagrams |

### Why Multiple Files?

1. **Working memory limits** - AI agents and humans work better with focused context
2. **Parallel work** - Multiple developers can work on different thrusts
3. **Incremental progress** - Complete one file's thrusts before moving on
4. **Easier review** - Reviewers can focus on relevant sections
5. **File size limits** - Keeps each file under 500 lines for readability

---

## Thrust Anatomy

Every thrust follows a consistent structure:

```markdown
## Thrust N: [Name]

### N.1 Objective
One-sentence goal for this thrust.

### N.2 Background (optional)
Context needed to understand the thrust.

### N.3 Subtasks

#### N.3.1 [First subtask]
Clear description of what to do.

#### N.3.2 [Second subtask]
...continue for all subtasks...

### N.4 Verification Steps
1. Step-by-step instructions to verify the thrust worked
2. Expected outcomes for each step

### N.5 Files Created/Modified
| File | Action |
|------|--------|
| `path/to/file.ts` | Created |
| `path/to/other.ts` | Modified |
```

---

## Thrust Completion Reports

Before marking any thrust as complete, a **Completion Report** must be created documenting what was accomplished. This ensures knowledge is captured for future maintainers and provides accountability.

### Report Requirements

Each report must include:

1. **Summary**: One-paragraph description of what was accomplished
2. **Files Changed**: List of all files created/modified with brief descriptions
3. **Key Decisions**: Any implementation decisions that deviated from or expanded the spec
4. **Verification Results**: Results of running verification steps
5. **Issues Encountered**: Any problems and how they were resolved
6. **Notes for Reviewers**: Context a senior developer would need

### Report Location

Reports are stored in a `reports/` directory within each DevGuide:

```
docs/DevGuides/DevGuide_vX.Y.Z/
├── 00-index.md
├── 01-overview.md
├── ...
└── reports/
    ├── thrust-01-report.md
    ├── thrust-02-report.md
    └── ...
```

### Report Template

```markdown
# Thrust N: [Name] - Completion Report

**Completed**: YYYY-MM-DD
**Implementer**: [Name/AI Agent]

## Summary
[One paragraph describing what was accomplished]

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `path/to/file` | Created/Modified | Brief description |

## Key Decisions

- **Decision 1**: [Rationale for any deviation or design choice]
- **Decision 2**: [Rationale]

## Verification Results

- [x] Step 1: [Result - PASSED]
- [x] Step 2: [Result - PASSED]

## Issues Encountered

None / [Description of issues and how they were resolved]

## Notes for Reviewers

[Any additional context a senior developer reviewing this work would need]
```

---

## Using DevGuides

### For AI Coding Agents

1. Read the `00-index.md` for orientation
2. Read `01-overview.md` to understand architecture
3. Execute thrusts sequentially
4. Complete all subtasks within a thrust before moving to the next
5. Run verification steps after each thrust
6. Update the checklist in appendices as you progress

### For Human Developers

1. Start with the index to understand scope
2. Read the overview to internalize the architecture
3. Work through thrusts in order (they build on each other)
4. Use the checklists to track progress
5. Refer to appendices for quick reference

### For Code Reviewers

1. Check which thrust(s) a PR implements
2. Verify the files modified match the thrust specification
3. Run the verification steps
4. Confirm the checklist was updated

---

## Creating New DevGuides

When you identify a significant improvement or feature:

1. **Create a new directory**: `DevGuide_vX.Y.Z/`
2. **Start with the index**: Define scope, success criteria, thrust overview
3. **Write the overview**: Current state, target state, architecture decisions
4. **Break into thrusts**: Group related work, ensure each is self-contained
5. **Add appendices**: File references, checklists, useful diagrams

### Naming Conventions

- Directory: `DevGuide_vX.Y.Z` (semantic version)
- Files: `NN-descriptive-name.md` (numbered for ordering)
- Thrusts: Sequential within each file

### Quality Checklist

Before considering a DevGuide complete:

- [ ] Each thrust has a clear objective
- [ ] Each thrust has verification steps
- [ ] Files created/modified are listed
- [ ] No code blocks in the guide (describe, don't implement)
- [ ] Cross-references between files work
- [ ] Appendices include comprehensive checklists
- [ ] Index provides quick navigation

---

## Current DevGuides

### AgentGate

| Version | Title | Status | Description |
|---------|-------|--------|-------------|
| [v0.2.4](./DevGuide_v0.2.4/00-index.md) | **GitHub-Backed Workspaces** | In Progress | Connect workspaces to GitHub repos, branch-per-run, auto PR creation |
| [v0.2.3](./DevGuide_v0.2.3/00-index.md) | **Complete Lint Cleanup** | Complete | Zero lint errors across entire codebase |
| [v0.2.2](./DevGuide_v0.2.2/00-index.md) | **Technical Debt Cleanup** | Complete | Fixed TypeScript/ESLint errors in agent module, updated package version |
| [v0.2.1](./DevGuide_v0.2.1/00-index.md) | **Multi-Agent Driver Support** | Complete | Added OpenAI Codex, OpenAI Agents, OpenCode SDK drivers |
| [v0.2.0](./DevGuide_v0.2.0/00-index.md) | **Claude Agent SDK Integration** | Complete | Added Claude Agent SDK driver as primary agent backend |
| [v0.1.0](./DevGuide_v0.1.0/00-index.md) | **Core Architecture** | Complete | Workspace manager, gate resolver, verifier, orchestrator |

### Legacy (Other Projects)

| Version | Title | Status | Description |
|---------|-------|--------|-------------|
| [devguide-v0.3.2](./devguide-v0.3.2/00-index.md) | **LAMMPS Reaper** | Complete | Minimal LAMMPS-only deck generator with LLM integration, L0-L3 validation, 106 unit tests + 12 live API tests |
| [devguide-v0.3.1](./devguide-v0.3.1/00-index.md) | **Testing, Validation & Production Hardening** | Complete | Real API verification, L0-L3 validation integration, streaming standardization, integration fixtures, error handling, health checks |
| [devguide-v0.3.0](./devguide-v0.3.0/00-index.md) | **Campaign Builder Agent Abstraction Layer** | Complete | Full architecture remake with LLM-native agents, provider abstraction, 3 adapters (Claude SDK, Anthropic Raw, Mock), tool registry, and reliability hardening |
| [devguide-dec_v0.1.0](./devguide-dec_v0.1.0/00-index.md) | **Campaign Builder Full Implementation** | Complete | Complete green field implementation with multi-agent architecture, FileGuide schemas, L0-L3 validation, and CLI |
| [v0.1.0](./DevGuide_v0.1.0/00-index.md) | Unified Data Layer Architecture | Complete | Transform mock data into production-ready data layer with SQLite, Drizzle ORM, React Query, and API routes |
| [v0.1.1](./DevGuide_v0.1.1/00-index.md) | Showcase Data Refactor | Complete | Replace generic mock data with 2 comprehensive showcase campaigns demonstrating MatterStack capabilities |
| [v0.1.2](./DevGuide_v0.1.2/00-index.md) | Interactive Campaign Experience | Complete | Collapsible sidebar, canvas graph with zoom/pan, expandable nodes, README display, real source code |
| [v0.1.3](./DevGuide_v0.1.3/00-index.md) | Bug Fixes & UX Polish | Complete | Fix README/source display, simplify workflow layout, theme toggle visibility, node expansion UX |
| [v0.1.4](./DevGuide_v0.1.4/reports/thrust-01-report.md) | Source Tab Missing Files Fix | Complete | Add missing README.md and scripts/train_model.py to batterySourceFiles array |
| [v0.1.5](./DevGuide_v0.1.5/00-index.md) | Dynamic Source Loading Architecture | Complete | Replace hard-coded source files with filesystem-based loading, tree UI, Git-ready provider pattern |
| [v0.1.6](./DevGuide_v0.1.6/00-index.md) | Max 500 LOC Refactor | Complete | Enforced max 500 lines per file; split `lib/showcase-data.ts` (1084 lines) into 9 domain modules; added `pnpm check:lines` enforcement |
| [v0.1.7](./DevGuide_v0.1.7/00-index.md) | Workflow UX & Inspect Reorganization | Complete | Canvas height fix, node detail sidebar, double-click expansion, default tab, grouped runs in Inspect, remove pagination |
| [v0.1.8](./DevGuide_v0.1.8/00-index.md) | Inspect Tab Aesthetic Refinement | Complete | Collapsible evidence panel, node section cards, type iconography, empty state polish, visual hierarchy |
| [v0.1.9](./DevGuide_v0.1.9/00-index.md) | Comprehensive Run Evidence & Data Consistency | Complete | Per-workorder evidence differentiation, realistic execution details, logical workflow consistency |
| [v0.1.10](./DevGuide_v0.1.10/00-index.md) | Workflow Accuracy & UX Polish | Complete | Workflow graph alignment with actual projects, interaction fixes, LaTeX rendering, parallel layout, position persistence |
| [v0.1.11](./DevGuide_v0.1.11/00-index.md) | Iterative Workflow Aesthetics | Complete | Cycle-aware displays, phase annotations, enhanced loop styling for active learning campaigns |
| [v0.1.12](./DevGuide_v0.1.12/00-index.md) | Workflow Canvas Refactor | Complete | Modularize 670-line canvas into 10 files, container extraction, registry pattern, layout strategies |
| [v0.1.13](./DevGuide_v0.1.13/00-index.md) | Inspect Tab Redesign | Complete | Complete redesign of Inspect tab as Run Intelligence Dashboard with analytics, filtering, detail panel |
| [v0.1.14](./DevGuide_v0.1.14/00-index.md) | Comprehensive Codebase Improvement | Complete | Three-phase orchestrated development: discovery, implementation, validation across all codebase areas |
| [v0.1.15](./DevGuide_v0.1.15/00-index.md) | Turso Database Migration | Complete | Migrate from local SQLite to Turso for Vercel deployment with dual-driver support |
| [v0.1.16](./DevGuide_v0.1.16/00-index.md) | Repository Cleanup & Technical Debt | Complete | Remove unused code, fix ESLint warnings (27→0), improve type safety, eliminate any types |

---

## Anti-Patterns to Avoid

### ❌ Don't Do This

- **Monolithic guides** - Split into focused thrusts
- **Code examples** - They become stale; describe patterns instead
- **Vague objectives** - Be specific about what success looks like
- **Missing verification** - Every change should be verifiable
- **Circular dependencies** - Thrusts should build linearly
- **Assumed knowledge** - Explain context even if it seems obvious

### ✅ Do This Instead

- **Focused thrusts** - Each achievable in one session
- **Pattern descriptions** - "Create a hook that..." not "const useHook = () => {"
- **Clear success criteria** - "Database should have 6 campaigns"
- **Step-by-step verification** - "Run pnpm test, expect all passing"
- **Linear progression** - Each thrust builds on previous
- **Complete context** - Assume the reader just opened the file

---

## Contributing

To propose a new DevGuide:

1. Identify a significant improvement opportunity
2. Create a brief proposal in the project's issue tracker
3. Get alignment on scope and approach
4. Write the DevGuide following this structure
5. Submit for review

---

**The goal is simple: make complex changes achievable, reviewable, and maintainable.**
