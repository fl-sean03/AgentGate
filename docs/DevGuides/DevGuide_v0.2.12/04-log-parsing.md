# 04: Log Parsing & Failure Extraction

## Thrust 5: Log Parser

### 5.1 Objective

Create a log parser that extracts structured failure information from CI logs.

### 5.2 Background

CI logs contain various types of failures:
- TypeScript/build errors with file:line references
- ESLint errors with rule names and locations
- Test failures with assertion details
- Generic errors with stack traces

Parsing these requires pattern matching and context extraction.

### 5.3 Subtasks

#### 5.3.1 Create Log Parser

Create `packages/server/src/github/log-parser.ts`:

**Class structure:**

The parser should:
- Accept raw log text
- Identify failure patterns
- Extract structured information
- Return CIFailure objects

**Parsing strategy:**

1. **Split into sections**: Separate by job/step markers
2. **Identify failure type**: Build, lint, test, other
3. **Extract error details**: Message, file, line
4. **Get context**: Surrounding lines for clarity

**Pattern matching:**

Define patterns for common error formats:

**TypeScript errors:**
```
src/file.ts(10,5): error TS2322: ...
src/file.ts:10:5 - error TS2322: ...
```

**ESLint errors:**
```
/path/to/file.ts
  10:5  error  Message  rule-name
```

**Vitest/Jest failures:**
```
 FAIL  src/test.test.ts > Suite > test name
   AssertionError: expected X to equal Y
```

**Generic errors:**
```
Error: message
    at function (file:line:col)
```

#### 5.3.2 Create Failure Summarizer

Create `packages/server/src/github/failure-summarizer.ts`:

**Purpose:**

Convert CIFailure[] into actionable remediation prompt.

**Prompt structure:**

```
The CI workflow failed with the following issues:

## Build Errors (if any)
- File: src/foo.ts, Line: 10
  Error: Type 'string' is not assignable to type 'number'

## Lint Errors (if any)
- File: src/bar.ts, Line: 25
  Error: 'x' is assigned but never used (no-unused-vars)

## Test Failures (if any)
- Test: src/test.test.ts > should work
  Error: Expected 1 to equal 2

Please fix these issues. The original task was:
{original prompt}

Files you modified:
{list of files}
```

**Grouping:**

Group errors by:
1. Type (build, lint, test)
2. File
3. Severity

**Truncation:**

If too many errors:
- Show first N of each type
- Indicate "and X more..."
- Prioritize most actionable

#### 5.3.3 Optional LLM Enhancement

For complex failures, optionally use LLM to:
- Summarize error patterns
- Suggest likely fixes
- Prioritize most important issues

This is opt-in via `AGENTGATE_CI_USE_LLM_SUMMARY=true`.

### 5.4 Verification Steps

1. Parser extracts TypeScript errors correctly
2. Parser extracts ESLint errors correctly
3. Parser extracts test failures correctly
4. Parser handles mixed error types
5. Summarizer creates valid prompt
6. Grouping and truncation work
7. Empty logs produce empty results

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/log-parser.ts` | Created |
| `packages/server/src/github/failure-summarizer.ts` | Created |

---

## Error Pattern Reference

### TypeScript Compiler Errors

**Format 1 (tsc):**
```
src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
```

**Format 2 (tsc --pretty):**
```
src/file.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.

10   const x: number = "hello";
         ~

  The expected type comes from property 'x'
```

**Regex patterns:**
```typescript
// Format 1
/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/

// Format 2
/^(.+):(\d+):(\d+) - error (TS\d+): (.+)$/
```

### ESLint Errors

**Format (stylish):**
```
/absolute/path/to/file.ts
   10:5   error  'foo' is assigned but never used  no-unused-vars
   15:10  error  Missing return type               @typescript-eslint/explicit-function-return-type
```

**Regex patterns:**
```typescript
// File path line
/^\/[\w\/.-]+\.(ts|tsx|js|jsx)$/

// Error line
/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w\/-@]+)$/
```

### Vitest/Jest Failures

**Format:**
```
 FAIL  src/file.test.ts > Suite Name > test name
Error: expect(received).toBe(expected)

Expected: 2
Received: 1

 ❯ src/file.test.ts:25:10
```

**Regex patterns:**
```typescript
// Test failure header
/^\s*FAIL\s+(.+)\s+>\s+(.+)\s+>\s+(.+)$/

// Assertion error
/^Error: expect\(.+\)\.(.+)\(.+\)$/

// Location
/^\s*❯\s+(.+):(\d+):(\d+)$/
```

### Generic Stack Traces

**Format:**
```
Error: Something went wrong
    at functionName (/path/to/file.ts:10:5)
    at Object.<anonymous> (/path/to/other.ts:20:10)
```

**Regex patterns:**
```typescript
// Error message
/^(Error|TypeError|SyntaxError|ReferenceError): (.+)$/

// Stack frame
/^\s+at\s+(?:(.+?)\s+)?\((.+):(\d+):(\d+)\)$/
```
