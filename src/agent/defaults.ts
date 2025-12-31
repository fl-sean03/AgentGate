import type {
  AgentConstraints,
  AgentRequest,
  ContextPointers,
  DriverCapabilities,
} from '../types/index.js';
import { DEFAULT_ALLOWED_TOOLS, DEFAULT_DISALLOWED_TOOLS } from './constraints.js';

/**
 * Default timeout for agent execution (5 minutes)
 */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Maximum timeout allowed (30 minutes)
 */
export const MAX_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Default max turns for agent execution
 * Set high to allow complex implementation tasks
 */
export const DEFAULT_MAX_TURNS = 100;

/**
 * Maximum max turns allowed
 */
export const MAX_TURNS_LIMIT = 100;

/**
 * Default constraints for agent execution.
 * Uses bypassPermissions for headless/automated execution.
 */
export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  allowedTools: [...DEFAULT_ALLOWED_TOOLS],
  disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
  maxTurns: DEFAULT_MAX_TURNS,
  permissionMode: 'bypassPermissions', // Required for headless execution
  additionalSystemPrompt: null,
};

/**
 * Empty context pointers
 */
export const EMPTY_CONTEXT_POINTERS: ContextPointers = {
  manifestPath: null,
  testsPath: null,
  docsPath: null,
  gatePlanPath: null,
  srcPath: null,
};

/**
 * Default driver capabilities for Claude Code
 */
export const CLAUDE_CODE_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: true,
  supportsTimeout: true,
  maxTurns: MAX_TURNS_LIMIT,
};

/**
 * Creates a default AgentRequest with required fields
 */
export function createDefaultRequest(
  workspacePath: string,
  taskPrompt: string
): AgentRequest {
  return {
    workspacePath,
    taskPrompt,
    gatePlanSummary: '',
    constraints: { ...DEFAULT_AGENT_CONSTRAINTS },
    priorFeedback: null,
    contextPointers: { ...EMPTY_CONTEXT_POINTERS },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    sessionId: null,
  };
}

/**
 * Builds a system prompt suffix for gate plan enforcement
 */
export function buildGatePlanSystemPrompt(gatePlanSummary: string): string {
  if (!gatePlanSummary.trim()) {
    return '';
  }

  return `
## Gate Plan Requirements

You must ensure your changes satisfy the following verification requirements:

${gatePlanSummary}

Before completing, verify that:
1. All changes follow the specified patterns and conventions
2. Required tests are present and passing
3. No disallowed patterns are introduced
`.trim();
}

/**
 * Builds a feedback system prompt for iteration
 */
export function buildFeedbackSystemPrompt(feedback: string): string {
  if (!feedback.trim()) {
    return '';
  }

  return `
## Prior Feedback

Your previous attempt had the following issues that must be addressed:

${feedback}

Focus on fixing these issues before proceeding with other changes.
`.trim();
}

/**
 * Returns embedded engineering standards as fallback
 * when AGENTS.md is not found in the workspace
 */
export function getEmbeddedStandards(): string {
  return `
# Engineering Standards

You are an autonomous software engineering agent. Follow these core standards:

## Core Principles

1. **Understand Before Implementing**
   - READ existing code before modifying
   - Check for existing utilities you can reuse
   - Look at similar implementations in the codebase

2. **Plan Before Coding**
   - Break tasks into discrete steps
   - Identify files that need changes
   - Consider edge cases BEFORE writing code

3. **Test As You Build**
   - **No code without tests** - Every new function needs unit tests
   - **Test edge cases** - Empty inputs, nulls, errors, boundaries
   - Write tests BEFORE or ALONGSIDE implementation

## Testing Requirements

### Unit Tests (MANDATORY)
Every new function/class MUST have corresponding tests in \`test/\`:
- Test happy path AND error cases
- Test edge cases (empty, null, invalid inputs)
- Use descriptive test names

### Integration Tests (MANDATORY for features)
If you add/modify:
- API endpoints → Add HTTP integration tests
- CLI commands → Add CLI invocation tests
- Database operations → Add persistence tests

## Validation Checklist

Before completing ANY task, verify:
- [ ] \`pnpm typecheck\` passes with NO errors
- [ ] \`pnpm lint\` passes with NO warnings
- [ ] \`pnpm test\` passes - all tests green
- [ ] \`pnpm build\` succeeds
- [ ] NEW tests written for new code

## Code Quality Standards
- No \`any\` types (use proper typing)
- No \`// @ts-ignore\` comments
- No console.log (use logger)
- Error handling in place
- Meaningful variable/function names

## Red Flags (Never Do These)
- ❌ Adding code without tests
- ❌ Using \`any\` type
- ❌ Swallowing errors with empty catch blocks
- ❌ Skipping error handling
- ❌ Not testing error paths

Quality is not optional. Tests are not optional. Every change must be verifiable.
`.trim();
}
