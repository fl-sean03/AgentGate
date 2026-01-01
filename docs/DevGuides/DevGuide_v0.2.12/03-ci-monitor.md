# 03: Log Parsing and Failure Summarization

## Thrust 3: CI Log Parser

### 3.1 Objective

Download and parse GitHub Actions workflow logs to extract failure information.

### 3.2 Background

GitHub Actions logs are:
- Downloaded as a zip archive containing multiple files
- One file per job, named with job name
- Each file contains timestamped log lines
- Grouped by step with ANSI color codes
- Can be very large (10-100MB for complex workflows)

We need to:
- Download and extract the zip
- Parse the log format
- Find failed steps
- Extract relevant error context

### 3.3 Subtasks

#### 3.3.1 Create Log Downloader Module

Create `packages/server/src/github/log-downloader.ts`:

**Class: LogDownloader**

Constructor accepts:
- `actionsClient`: ActionsClient instance

**Methods:**

1. `downloadLogs(runId)`: Download and extract logs
   - Fetch zip archive from GitHub API
   - Extract to memory (no disk writes)
   - Return map of job name → log content
   - Handle extraction errors

2. `getLogsForJob(runId, jobName)`: Get specific job logs
   - Download full archive
   - Return only the requested job's log
   - Return null if job not found

**Implementation Notes:**
- Use `adm-zip` or similar for extraction
- Stream extraction to avoid memory spikes
- Strip ANSI color codes for parsing
- Preserve color codes optionally for display

#### 3.3.2 Create Log Parser Module

Create `packages/server/src/github/log-parser.ts`:

**Class: LogParser**

**Methods:**

1. `parse(logContent)`: Parse raw log content
   - Identify step boundaries
   - Extract timestamps
   - Group content by step
   - Return structured ParsedLog

2. `findFailures(parsedLog)`: Find failed steps
   - Identify steps with non-zero exit codes
   - Extract error messages
   - Return array of FailedStep

3. `extractErrorContext(logContent, errorLine, contextLines)`: Get surrounding context
   - Find the error in the log
   - Extract N lines before and after
   - Return contextual snippet

**ParsedLog Structure:**
- steps: ParsedStep[]
- totalLines: number
- duration: number (estimated from timestamps)

**ParsedStep Structure:**
- name: string
- startLine: number
- endLine: number
- content: string
- status: 'success' | 'failure' | 'skipped'
- exitCode: number | null
- duration: string | null

#### 3.3.3 Parse GitHub Actions Log Format

GitHub Actions logs have specific patterns:

**Step markers:**
```
##[group]Step Name
... step content ...
##[endgroup]
```

**Error markers:**
```
##[error]Error message
```

**Exit codes:**
```
Process completed with exit code 1.
```

**Timestamp format:**
```
2024-01-01T00:00:00.0000000Z content
```

The parser should:
- Split on step boundaries
- Detect error markers
- Extract exit codes
- Handle malformed logs gracefully

#### 3.3.4 Handle Common CI Failure Patterns

Detect and categorize common failures:

**Test Failures (vitest/jest):**
```
FAIL test/file.test.ts > describe > test name
Error: expected X but got Y
```

**TypeScript Errors:**
```
src/file.ts(10,5): error TS2345: Argument of type...
```

**ESLint Errors:**
```
/path/to/file.ts
  10:5  error  Message  rule-name
```

**Build Errors:**
```
error: Build failed
```

**Runtime Errors:**
```
Error: Cannot find module 'x'
    at require (...)
```

For each pattern, extract:
- File/location if available
- Error message
- Rule/code if applicable

#### 3.3.5 Strip ANSI Codes

GitHub logs contain ANSI escape codes for coloring:
```
[31mError text[39m
```

Create utility to:
- Strip all ANSI sequences for parsing
- Optionally preserve for display
- Handle malformed sequences

### 3.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Parse sample logs from real CI failures
4. Test with logs of various sizes
5. Test malformed log handling

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/log-downloader.ts` | Created |
| `packages/server/src/github/log-parser.ts` | Created |
| `packages/server/src/github/index.ts` | Modified |
| `packages/server/test/log-parser.test.ts` | Created |

---

## Thrust 4: Failure Summarizer

### 4.1 Objective

Transform parsed log failures into actionable feedback for the agent.

### 4.2 Background

Raw log output is:
- Verbose and noisy
- Contains irrelevant information
- Not formatted for agent consumption
- Missing context about what to fix

We need to produce:
- Concise summary of what failed
- Specific error messages
- Actionable fix suggestions
- Structured format for agent prompts

### 4.3 Subtasks

#### 4.3.1 Create Failure Summarizer Module

Create `packages/server/src/github/failure-summarizer.ts`:

**Class: FailureSummarizer**

**Methods:**

1. `summarize(monitorResult, logs)`: Create full CI summary
   - Aggregate failures from all jobs
   - Parse and categorize errors
   - Generate actionable items
   - Return CISummary

2. `summarizeJob(jobResult, jobLog)`: Summarize single job
   - Find failed steps
   - Extract error context
   - Return JobSummary

3. `generateActionItems(failures)`: Create fix suggestions
   - Analyze failure patterns
   - Suggest specific fixes
   - Prioritize by severity

#### 4.3.2 Define Summary Types

**CISummary:**
- overallStatus: 'success' | 'failure'
- totalJobs: number
- failedJobs: number
- jobSummaries: JobSummary[]
- actionItems: ActionItem[]
- markdown: string (formatted for agent)

**JobSummary:**
- jobName: string
- status: 'success' | 'failure'
- failedSteps: StepFailure[]
- errorCount: number

**StepFailure:**
- stepName: string
- category: 'test' | 'lint' | 'typecheck' | 'build' | 'other'
- errors: ErrorInfo[]
- logSnippet: string

**ErrorInfo:**
- message: string
- file: string | null
- line: number | null
- code: string | null
- context: string | null

**ActionItem:**
- priority: 'high' | 'medium' | 'low'
- category: string
- description: string
- files: string[]

#### 4.3.3 Implement Error Categorization

Categorize errors for better feedback:

**Test Failures:**
- Category: 'test'
- Priority: high
- Action: "Fix failing test in {file}"

**TypeScript Errors:**
- Category: 'typecheck'
- Priority: high
- Action: "Fix type error in {file}:{line}"

**Lint Errors:**
- Category: 'lint'
- Priority: medium
- Action: "Fix lint issues or run `pnpm lint --fix`"

**Build Errors:**
- Category: 'build'
- Priority: high
- Action: "Fix build error"

**Unknown Errors:**
- Category: 'other'
- Priority: medium
- Action: "Investigate error in {step}"

#### 4.3.4 Generate Markdown Feedback

Format the summary as markdown for agent consumption:

```markdown
# CI Failure Report

## Summary
- **Status:** Failed
- **Failed Jobs:** 3 of 5
- **Total Errors:** 7

## Failed Jobs

### 1. Tests (Node 20) - FAILED

#### Step: Run tests

**Test Failures:**

1. `test/git-ops.test.ts` > Git Operations > merge operations
   ```
   Error: pathspec 'main' did not match any file(s) known to git
   ```

2. `test/config.test.ts` > Configuration > defaults
   ```
   Expected: 5
   Received: undefined
   ```

<details>
<summary>Full log snippet</summary>

```
[relevant log lines]
```

</details>

### 2. TypeScript Check - FAILED

#### Step: Run typecheck

**TypeScript Errors:**

1. `src/github/actions-client.ts(45,10)`
   ```
   error TS2339: Property 'foo' does not exist on type 'Bar'
   ```

## Action Items

1. **[HIGH]** Fix test assumptions about git branch names in `test/git-ops.test.ts`
2. **[HIGH]** Fix type error in `src/github/actions-client.ts:45`
3. **[MEDIUM]** Investigate undefined config value in tests

## Instructions

Please fix these issues and push to the same branch. The CI will automatically re-run.
Focus on the HIGH priority items first.
```

#### 4.3.5 Implement Smart Truncation

Logs can be huge. Implement smart truncation:

**Rules:**
- Keep first occurrence of each unique error
- Limit log snippets to 50 lines
- Limit total summary to ~5000 characters
- Always include action items
- Provide "expand" option for full logs

**Deduplication:**
- Same error in multiple test files → group
- Same TypeScript error multiple times → show once with count
- Stack traces → truncate to relevant frames

#### 4.3.6 Handle Edge Cases

**No actionable errors found:**
- Include raw output of failed step
- Suggest manual investigation
- Note: "Unable to parse specific errors"

**Too many errors:**
- Show first 10 with full detail
- Count remaining
- Note: "And N more errors..."

**Flaky tests:**
- Detect test that passed on retry
- Note potential flakiness
- Lower priority for investigation

### 4.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Test with real CI failure logs
4. Verify markdown renders correctly
5. Test truncation with large logs
6. Test deduplication logic

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/failure-summarizer.ts` | Created |
| `packages/server/src/github/index.ts` | Modified |
| `packages/server/test/failure-summarizer.test.ts` | Created |

---

## Testing Requirements

### Log Parser Tests

Use sample logs from real CI runs:

1. Parse vitest failure output
2. Parse TypeScript errors
3. Parse ESLint errors
4. Parse build failures
5. Parse multi-job logs
6. Handle empty logs
7. Handle malformed logs
8. Strip ANSI codes correctly

### Failure Summarizer Tests

Test summary generation:

1. Single test failure
2. Multiple test failures
3. TypeScript errors
4. Mixed error types
5. Truncation with many errors
6. Deduplication
7. Markdown format validation
8. Action item generation
9. Priority assignment

---

## Sample Log Patterns

### Vitest Failure

```
 FAIL  test/config.test.ts > Configuration > should validate port range
AssertionError: expected 3000 to be 3001

- Expected   "3001"
+ Received   "3000"

 ❯ test/config.test.ts:45:19
     43|     const config = getConfig();
     44|
     45|     expect(config.port).toBe(3001);
       |                         ^
     46|   });
     47| });
```

### TypeScript Error

```
src/github/client.ts:23:5 - error TS2322: Type 'string' is not assignable to type 'number'.

23     const id: number = run.id.toString();
       ~~~~~

  src/github/types.ts:10:3
    10   id: number;
         ~~
    The expected type comes from property 'id' which is declared here on type 'WorkflowRun'
```

### ESLint Error

```
/home/runner/work/repo/packages/server/src/config/index.ts
  15:7  error  'unused' is defined but never used  @typescript-eslint/no-unused-vars
  23:1  error  Expected indentation of 2 spaces    indent

✖ 2 problems (2 errors, 0 warnings)
```

### Build Error

```
error during build:
src/index.ts(1,1): error TS6053: File '/path/to/missing.ts' not found.
```
