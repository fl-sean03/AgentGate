# Module G: Feedback Generator

## Purpose

Transform raw verifier output into structured, actionable feedback for the agent. Good feedback enables effective auto-fix loops.

---

## Thrust 24: Feedback Structure Design

### 24.1 Objective

Define the feedback format that maximizes agent repair success.

### 24.2 Background

Feedback must be:
- Concise (fits in context window)
- Structured (parseable by agent)
- Actionable (points to specific fixes)
- Prioritized (most important first)

### 24.3 Subtasks

#### 24.3.1 Define Feedback Structure

Create `src/feedback/types.ts`:

`StructuredFeedback` structure:
- `iteration`: number
- `overallStatus`: 'failed'
- `summary`: string (one paragraph)
- `failedLevel`: 'L0' | 'L1' | 'L2' | 'L3'
- `failures`: Failure[]
- `suggestions`: string[]
- `fileReferences`: FileReference[]

`Failure` structure:
- `level`: 'L0' | 'L1' | 'L2' | 'L3'
- `type`: FailureType
- `message`: string
- `details`: string | null
- `command`: string | null
- `exitCode`: number | null
- `file`: string | null
- `line`: number | null
- `expected`: string | null
- `actual`: string | null

`FailureType` enum:
- `MISSING_FILE`
- `FORBIDDEN_FILE`
- `SCHEMA_VIOLATION`
- `TEST_FAILED`
- `TEST_TIMEOUT`
- `ASSERTION_FAILED`
- `BUILD_ERROR`
- `RUNTIME_ERROR`
- `RESOURCE_EXCEEDED`

`FileReference` structure:
- `path`: string
- `reason`: string
- `suggestion`: string | null

### 24.4 Verification Steps

1. Types compile without errors
2. Sample feedback validates against structure

### 24.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/feedback/types.ts` | Created |

---

## Thrust 25: Feedback Generation

### 25.1 Objective

Implement the generator that transforms verification reports to feedback.

### 25.2 Subtasks

#### 25.2.1 Create Feedback Generator

Create `src/feedback/generator.ts`:

Main function:
- `generateFeedback(report: VerificationReport, iteration: number): StructuredFeedback`

The generator:
1. Identify first failing level
2. Extract failures from that level
3. Parse error messages for details
4. Generate file references
5. Create actionable suggestions
6. Compile into structured format

#### 25.2.2 Implement L0 Failure Extraction

For contract failures:
- Missing file: Include expected path
- Forbidden file: Include found path and why forbidden
- Schema violation: Include field, expected type, actual value

#### 25.2.3 Implement L1 Failure Extraction

For test failures:
- Parse test output to find failure location
- Extract assertion messages
- Include relevant stderr excerpts
- Truncate large outputs (max 500 chars per failure)

Common test output patterns:
- Jest: `✕ test name` followed by error
- Vitest: Similar to Jest
- pytest: `FAILED path::test_name` followed by traceback
- Generic: Exit code + last lines of stderr

#### 25.2.4 Implement L2 Failure Extraction

For black-box failures:
- Include fixture name
- Show expected vs actual for schema errors
- Include diff for content mismatches

#### 25.2.5 Implement L3 Failure Extraction

For sanity failures:
- Resource usage details
- Isolation violation specifics
- Cleanup failure reasons

### 25.3 Verification Steps

1. L0 failure generates missing file feedback
2. L1 failure extracts test name and assertion
3. L2 failure shows expected/actual
4. Multiple failures prioritized correctly
5. Output truncated to reasonable size

### 25.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/feedback/generator.ts` | Created |

---

## Thrust 26: Output Formatting

### 26.1 Objective

Format feedback for agent consumption.

### 26.2 Background

The agent receives feedback as text in its prompt. Format must be:
- Readable by LLM
- Structured with clear sections
- Not too verbose
- Contains all necessary information

### 26.3 Subtasks

#### 26.3.1 Create Feedback Formatter

Create `src/feedback/formatter.ts`:

Functions:
- `formatForAgent(feedback: StructuredFeedback): string` - Agent-readable format
- `formatForHuman(feedback: StructuredFeedback): string` - Human-readable format
- `formatForJson(feedback: StructuredFeedback): string` - JSON format

#### 26.3.2 Agent Format Template

```
## Verification Failed - Iteration {n}

### Summary
{summary}

### Failed at Level: {level}

### Failures

#### Failure 1: {type}
- **Message**: {message}
- **File**: {file}:{line}
- **Command**: {command}
- **Exit Code**: {exitCode}
- **Expected**: {expected}
- **Actual**: {actual}

{details}

---

#### Failure 2: ...

### Files to Review
- {path}: {reason}

### Suggestions
1. {suggestion1}
2. {suggestion2}

### Instructions
Please fix the issues above and ensure all tests pass before completing.
Do not modify the gate plan or test fixtures.
Run the failing commands locally to verify your fix.
```

#### 26.3.3 Implement Truncation Logic

Ensure feedback fits context limits:
- Max 4000 characters total
- Max 500 characters per failure detail
- Prioritize: summary > failures > suggestions
- If truncated, indicate "... (truncated)"

#### 26.3.4 Handle Multiple Failure Types

When multiple levels fail:
- Lead with the earliest failing level
- Include note about subsequent level failures
- Suggest fixing L0 before L1, etc.

### 26.4 Verification Steps

1. Agent format is readable and structured
2. Human format is nicely colored
3. JSON format parses correctly
4. Long output truncated with indicator
5. Multiple failures formatted clearly

### 26.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/feedback/formatter.ts` | Created |
| `agentgate/src/feedback/index.ts` | Created |

---

## Thrust 27: Suggestion Generation

### 27.1 Objective

Generate actionable suggestions based on failure patterns.

### 27.2 Subtasks

#### 27.2.1 Create Suggestion Engine

Create `src/feedback/suggestions.ts`:

Function:
- `generateSuggestions(failures: Failure[]): string[]`

The engine:
1. Analyze failure types
2. Match against known patterns
3. Generate specific suggestions
4. Deduplicate and prioritize

#### 27.2.2 Define Suggestion Patterns

Common patterns and suggestions:

**Missing File**:
- Pattern: Required file not found
- Suggestion: "Create {path} with required content"

**Import Error**:
- Pattern: Module not found in test output
- Suggestion: "Check imports in {file}, ensure module is installed"

**Type Error**:
- Pattern: TypeScript/type error in output
- Suggestion: "Fix type error in {file}:{line}"

**Test Assertion**:
- Pattern: Expected X, got Y
- Suggestion: "Update {file} to produce expected output, or update test if behavior is intentional"

**Timeout**:
- Pattern: Test/command timed out
- Suggestion: "Optimize {command} or increase timeout if operation is expected to be slow"

**Forbidden File**:
- Pattern: Detected forbidden file
- Suggestion: "Remove {path} or add to .gitignore if needed locally"

#### 27.2.3 Implement Pattern Matching

Use regex patterns to detect failure types:
- Parse error messages for common patterns
- Extract file paths and line numbers
- Match against suggestion templates

### 27.3 Verification Steps

1. Missing file generates create suggestion
2. Type error generates fix suggestion
3. Multiple failures get relevant suggestions
4. No duplicate suggestions
5. Suggestions are actionable

### 27.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/feedback/suggestions.ts` | Created |

---

## Module G Complete Checklist

- [ ] Feedback types defined
- [ ] Generator implemented
- [ ] L0 failure extraction working
- [ ] L1 failure extraction working
- [ ] L2 failure extraction working
- [ ] L3 failure extraction working
- [ ] Agent format readable
- [ ] Human format pretty
- [ ] JSON format valid
- [ ] Truncation logic working
- [ ] Suggestion engine implemented
- [ ] Common patterns recognized
- [ ] Unit tests passing

---

## Next Steps

Proceed to [09-artifact-store.md](./09-artifact-store.md) for Module H implementation.
