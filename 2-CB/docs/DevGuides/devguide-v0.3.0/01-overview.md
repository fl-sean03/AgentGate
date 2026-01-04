# DevGuide v0.3.0: Architecture Overview

---

## The Paradigm Shift

### What We Had (v0.1.0)

Campaign Builder v0.1.0 implemented a **deterministic parsing approach**:

1. **FileAnalyzer** used regex patterns and string parsing to extract data from files
2. **CampaignPlanner** used template-based generation with parameter substitution
3. No actual LLM calls were made - the "agents" were Python functions

This worked for predictable file formats but failed when:
- Files had unexpected formatting
- Comments or documentation were interspersed with data
- Force field parameters were in non-standard locations
- Users described intent in natural language

### What We're Building (v0.3.0)

Campaign Builder v0.3.0 implements a **true LLM-native approach**:

1. **FileAnalyzer** sends file contents to Claude with analysis instructions
2. Claude understands the semantic meaning of the file content
3. Claude extracts structured data into FileGuide format
4. **CampaignPlanner** uses Claude to generate simulation input based on understanding
5. The entire pipeline is natural language in, validated files out

---

## Why Provider Abstraction?

We're not just swapping in Claude calls. We're building an **abstraction layer** because:

### 1. Testability
- Unit tests shouldn't require API calls
- Mock adapter provides deterministic responses
- CI/CD can run without API keys

### 2. Cost Control
- Development uses cheaper models or mocks
- Production uses appropriate model tier
- Easy A/B testing between models

### 3. Future Flexibility
- Anthropic may release new SDKs
- Open-source models may become viable
- Custom fine-tuned models may be needed

### 4. Failure Resilience
- If Claude Agent SDK has issues, fall back to raw API
- If API is down, use cached/mock responses
- Graceful degradation instead of complete failure

---

## Design Decisions

### Decision 1: Interface-First Design

**Choice:** Define abstract interface before any implementation

**Rationale:**
- Forces clear contract between agents and providers
- Makes testing straightforward
- Enables parallel development of adapters

**Implementation:**
- `AgentProvider` abstract base class
- `ToolDefinition` dataclass for provider-agnostic tools
- `AgentResult` dataclass for standardized responses

### Decision 2: Tool Registry Pattern

**Choice:** Centralized tool registry instead of per-agent tools

**Rationale:**
- Tools are reusable across agents
- Easy to enable/disable tools per use case
- Single source of truth for tool definitions

**Implementation:**
- `ToolRegistry` class with register/get/list methods
- Tools self-register on module import
- Agents request tools by name from registry

### Decision 3: Configuration via Environment

**Choice:** Provider selection via environment variables, not code

**Rationale:**
- Same code runs in dev/test/prod
- No recompilation needed to switch providers
- Secrets (API keys) stay in environment

**Implementation:**
- `.env` file with `AGENT_PROVIDER` setting
- Factory function reads environment
- Falls back to sensible defaults

### Decision 4: Streaming-First Architecture

**Choice:** Support streaming responses as primary mode

**Rationale:**
- Better UX for long-running operations
- Progress visibility during analysis
- Matches CLI's existing progress reporting

**Implementation:**
- `stream()` method returns AsyncIterator
- `run()` method for simple one-shot cases
- Both return same `AgentResult` structure

### Decision 5: Graceful Degradation

**Choice:** System works (partially) even without LLM access

**Rationale:**
- API outages shouldn't break everything
- Local validation still valuable
- Some operations don't need LLM

**Implementation:**
- Mock adapter for offline use
- Cached responses for common queries
- Clear error messages about degraded mode

---

## Data Flow: File Analysis

```
User runs: campaign-builder analyze ./workspace

1. CLI parses arguments, loads configuration
2. Runner discovers files in workspace
3. For each file:
   a. Runner gets AgentProvider from factory
   b. Runner calls provider.run() with:
      - prompt: "Analyze this file: {content}"
      - system_prompt: FILE_ANALYZER_PROMPT
      - tools: [read_file, validate_syntax, ...]
   c. Provider sends to LLM, handles tool calls
   d. LLM returns structured FileGuide JSON
   e. Runner parses JSON into FileGuide dataclass
4. Runner aggregates results
5. CLI displays FileGuides to user
```

---

## Data Flow: Campaign Generation

```
User runs: campaign-builder generate ./workspace "equilibrate at 300K"

1. CLI parses arguments, loads configuration
2. Runner analyzes all files (above flow) → FileGuides
3. Runner gets AgentProvider for CampaignPlanner
4. Runner calls provider.run() with:
   - prompt: "Generate simulation for: {intent}\nFiles: {file_guides}"
   - system_prompt: CAMPAIGN_PLANNER_PROMPT
   - tools: [write_file, validate_lammps, run_check, ...]
5. LLM generates input file content
6. LLM uses validate_lammps tool to check syntax
7. LLM iterates until validation passes
8. Runner collects generated files
9. CLI displays results and paths
```

---

## Tool Categories

### Category 1: Document Tools
Reading and parsing various file formats.

| Tool | Purpose | When Used |
|------|---------|-----------|
| read_pdf | Extract text from PDF | Force field documentation |
| read_excel | Parse spreadsheet data | Parameter tables |
| read_csv | Parse CSV files | Experimental data |

### Category 2: Validation Tools
Checking generated files for correctness.

| Tool | Purpose | When Used |
|------|---------|-----------|
| validate_l0 | Check for placeholders | Before L1 validation |
| validate_l1_lammps | LAMMPS syntax check | After generation |
| validate_l1_qe | QE syntax check | After generation |
| validate_l2 | Engine acceptance | Final validation |
| validate_l3 | Physics sanity | Final validation |

### Category 3: Utility Tools
General-purpose file and system operations.

| Tool | Purpose | When Used |
|------|---------|-----------|
| read_file | Read any text file | File analysis |
| write_file | Write generated content | Campaign output |
| glob_files | Find files by pattern | Discovery |
| run_command | Execute shell commands | Engine validation |

---

## Error Handling Strategy

### Level 1: Tool Errors
- Tool returns error message
- LLM sees error and can retry or adapt
- Example: File not found → LLM tries different path

### Level 2: LLM Errors
- Invalid JSON response → Retry with clarification
- Rate limit → Exponential backoff
- Timeout → Return partial results

### Level 3: Provider Errors
- Claude SDK fails → Fall back to raw Anthropic
- All providers fail → Return with clear error message
- Network issues → Retry with timeout

### Level 4: System Errors
- Configuration invalid → Clear error message
- Missing dependencies → Installation instructions
- Permission denied → Explain required permissions

---

## Security Considerations

### API Key Protection
- Keys in `.env` file, never in code
- `.env` in `.gitignore`
- Keys loaded only when needed

### Tool Sandboxing
- Tools cannot execute arbitrary code
- File operations restricted to workspace
- Shell commands limited to safe set

### Output Validation
- All LLM output parsed and validated
- No direct execution of LLM-generated code
- User confirmation for destructive operations

---

## Performance Considerations

### Parallel File Analysis
- Multiple files analyzed concurrently
- Semaphore limits concurrent API calls
- Progress reported per-file

### Response Caching
- Identical prompts can use cached responses
- Cache invalidated on file changes
- Configurable cache duration

### Token Optimization
- File content truncated intelligently
- System prompts cached (Anthropic feature)
- Tools only included when needed

---

## Testing Strategy

### Unit Tests (Mock Adapter)
- No API calls
- Deterministic responses
- Fast execution

### Integration Tests (Real Adapter)
- Uses actual Claude API
- Marked as slow/expensive
- Run manually or in nightly CI

### Contract Tests
- Verify adapters implement interface correctly
- Test response format consistency
- Validate error handling

---

## Migration Path

### Step 1: Add Abstraction (Thrusts 1-3)
- Create interface alongside existing code
- No behavior changes
- All existing tests pass

### Step 2: Implement Adapters (Thrusts 4-6)
- Build adapters that conform to interface
- Test each adapter independently
- Verify equivalent behavior

### Step 3: Migrate Tools (Thrusts 7-9)
- Convert tools to ToolDefinition format
- Register in central registry
- Maintain backward compatibility

### Step 4: Integrate Agents (Thrusts 10-11)
- Swap deterministic parsing for LLM calls
- Keep same external API
- Add new LLM-specific tests

### Step 5: Validate & Harden (Thrusts 12-13)
- End-to-end testing
- Performance optimization
- Error handling refinement

---

## Next Document

Continue to [02-foundation.md](./02-foundation.md) for Thrusts 1-3: Interface, Tools, and Factory implementation details.
