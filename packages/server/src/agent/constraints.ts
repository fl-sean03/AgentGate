import type { AgentConstraints } from '../types/index.js';

/**
 * Default allowed tools for agent execution
 */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash',
] as const;

/**
 * Default disallowed tool patterns
 * Format: "Tool(pattern:*)" for pattern matching
 */
export const DEFAULT_DISALLOWED_TOOLS: readonly string[] = [
  'Bash(rm -rf:*)',
  'Bash(curl:*)',
  'Bash(wget:*)',
  'Bash(ssh:*)',
] as const;

/**
 * Default constraint values
 */
export const DEFAULT_CONSTRAINTS: AgentConstraints = {
  allowedTools: [...DEFAULT_ALLOWED_TOOLS],
  disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
  maxTurns: 100,
  permissionMode: 'plan',
  additionalSystemPrompt: null,
};

/**
 * Validation result for constraint checking
 */
export interface ConstraintValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Merges default constraints with custom overrides.
 * Custom arrays completely replace defaults (no merging of array items).
 */
export function mergeConstraints(
  defaults: AgentConstraints,
  custom: Partial<AgentConstraints>
): AgentConstraints {
  return {
    allowedTools: custom.allowedTools ?? defaults.allowedTools,
    disallowedTools: custom.disallowedTools ?? defaults.disallowedTools,
    maxTurns: custom.maxTurns ?? defaults.maxTurns,
    permissionMode: custom.permissionMode ?? defaults.permissionMode,
    additionalSystemPrompt:
      custom.additionalSystemPrompt !== undefined
        ? custom.additionalSystemPrompt
        : defaults.additionalSystemPrompt,
  };
}

/**
 * Validates agent constraints for correctness
 */
export function validateConstraints(
  constraints: AgentConstraints
): ConstraintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check maxTurns
  if (constraints.maxTurns < 1) {
    errors.push('maxTurns must be at least 1');
  }
  if (constraints.maxTurns > 100) {
    warnings.push('maxTurns exceeds recommended maximum of 100');
  }

  // Check allowedTools
  if (constraints.allowedTools.length === 0) {
    warnings.push('No allowed tools specified - agent may be very limited');
  }

  // Check for conflicting tool specifications
  for (const allowed of constraints.allowedTools) {
    for (const disallowed of constraints.disallowedTools) {
      // Check if exact match
      if (allowed === disallowed) {
        errors.push(`Tool "${allowed}" is both allowed and disallowed`);
      }
      // Check if allowed tool is blocked by a pattern
      const patternMatch = disallowed.match(/^(\w+)\((.+)\)$/);
      if (patternMatch) {
        const [, toolName] = patternMatch;
        if (toolName === allowed) {
          // This is fine - a tool can be allowed but with certain command patterns blocked
          continue;
        }
      }
    }
  }

  // Check permission mode is valid
  const validModes = ['plan', 'acceptEdits', 'bypassPermissions'];
  if (!validModes.includes(constraints.permissionMode)) {
    errors.push(
      `Invalid permission mode: ${constraints.permissionMode}. Must be one of: ${validModes.join(', ')}`
    );
  }

  // Warn about bypass mode
  if (constraints.permissionMode === 'bypassPermissions') {
    warnings.push(
      'bypassPermissions mode may allow dangerous operations - use with caution'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Creates a minimal constraint set with only essential tools
 */
export function createMinimalConstraints(): AgentConstraints {
  return {
    allowedTools: ['Read', 'Glob', 'Grep'],
    disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
    maxTurns: 5,
    permissionMode: 'plan',
    additionalSystemPrompt: null,
  };
}

/**
 * Creates a permissive constraint set for trusted environments
 */
export function createPermissiveConstraints(): AgentConstraints {
  return {
    allowedTools: [...DEFAULT_ALLOWED_TOOLS],
    disallowedTools: [], // No restrictions
    maxTurns: 50,
    permissionMode: 'acceptEdits',
    additionalSystemPrompt: null,
  };
}
