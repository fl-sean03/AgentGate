/**
 * Structured Build Error Types (v0.2.19 - Thrust 4)
 *
 * Provides typed error classification for build failures, enabling
 * structured debugging and automated error analysis.
 */

/**
 * Enumeration of all possible build error types.
 */
export const BuildErrorType = {
  // Agent-related errors
  AGENT_CRASH: 'agent_crash',
  AGENT_TIMEOUT: 'agent_timeout',
  AGENT_TASK_FAILURE: 'agent_task_failure',

  // Verification-related errors
  TYPECHECK_FAILED: 'typecheck_failed',
  LINT_FAILED: 'lint_failed',
  TEST_FAILED: 'test_failed',
  BLACKBOX_FAILED: 'blackbox_failed',
  CI_FAILED: 'ci_failed',

  // Infrastructure errors
  WORKSPACE_ERROR: 'workspace_error',
  SNAPSHOT_ERROR: 'snapshot_error',
  GITHUB_ERROR: 'github_error',
  SYSTEM_ERROR: 'system_error',

  // Fallback
  UNKNOWN: 'unknown',
} as const;

export type BuildErrorType = (typeof BuildErrorType)[keyof typeof BuildErrorType];

/**
 * Human-readable descriptions for each error type.
 */
export const BUILD_ERROR_DESCRIPTIONS: Record<BuildErrorType, string> = {
  [BuildErrorType.AGENT_CRASH]: 'The agent process crashed unexpectedly',
  [BuildErrorType.AGENT_TIMEOUT]: 'The agent exceeded the maximum execution time',
  [BuildErrorType.AGENT_TASK_FAILURE]: 'The agent failed to complete the assigned task',
  [BuildErrorType.TYPECHECK_FAILED]: 'TypeScript type checking failed',
  [BuildErrorType.LINT_FAILED]: 'Code linting failed',
  [BuildErrorType.TEST_FAILED]: 'One or more tests failed',
  [BuildErrorType.BLACKBOX_FAILED]: 'Blackbox integration tests failed',
  [BuildErrorType.CI_FAILED]: 'CI pipeline checks failed',
  [BuildErrorType.WORKSPACE_ERROR]: 'Workspace setup or access error',
  [BuildErrorType.SNAPSHOT_ERROR]: 'Failed to capture code snapshot',
  [BuildErrorType.GITHUB_ERROR]: 'GitHub API or integration error',
  [BuildErrorType.SYSTEM_ERROR]: 'Internal system error',
  [BuildErrorType.UNKNOWN]: 'An unknown error occurred',
};

/**
 * Structured build error with full context for debugging.
 */
export interface BuildError {
  /** The classified error type */
  type: BuildErrorType;

  /** Human-readable error message */
  message: string;

  /** Process exit code (if applicable) */
  exitCode: number | null;

  /** Tail of stdout for debugging (last N lines) */
  stdoutTail: string | null;

  /** Tail of stderr for debugging (last N lines) */
  stderrTail: string | null;

  /** Path to the full agent result file */
  agentResultFile: string | null;

  /** Path to the verification report file */
  verificationFile: string | null;

  /** Additional context for the error */
  context: Record<string, unknown>;

  /** At what phase/point the error occurred */
  failedAt: string;
}

/**
 * Create an empty BuildError with defaults.
 */
export function createBuildError(
  type: BuildErrorType,
  message: string,
  failedAt: string
): BuildError {
  return {
    type,
    message,
    exitCode: null,
    stdoutTail: null,
    stderrTail: null,
    agentResultFile: null,
    verificationFile: null,
    context: {},
    failedAt,
  };
}
