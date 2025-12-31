import type { AgentStructuredOutput, TokenUsage } from '../types/index.js';
import { createLogger } from '../utils/index.js';

const logger = createLogger('agent:output-parser');

/**
 * Parses Claude Code JSON output from stdout
 */
export function parseOutput(stdout: string): AgentStructuredOutput | null {
  if (!stdout.trim()) {
    logger.debug('Empty stdout, returning null');
    return null;
  }

  try {
    // Claude Code outputs JSON when using --output-format json
    // The output should be a single JSON object
    const trimmed = stdout.trim();

    // Handle case where there might be multiple JSON objects (take the last one)
    const lines = trimmed.split('\n');
    let jsonStr = trimmed;

    // Look for the last valid JSON object
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line !== undefined && line.trim().startsWith('{')) {
        // Try to find complete JSON object starting from this line
        jsonStr = lines.slice(i).join('\n');
        break;
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);

    if (!isAgentStructuredOutput(parsed)) {
      logger.warn('Parsed JSON does not match AgentStructuredOutput structure');
      // Try to extract what we can
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        const result: AgentStructuredOutput = {
          result: String(obj['result'] ?? obj['output'] ?? obj['response'] ?? ''),
        };
        if (typeof obj['session_id'] === 'string') {
          result.session_id = obj['session_id'];
        }
        const usage = extractUsageFromUnknown(obj['usage']);
        if (usage) {
          result.usage = usage;
        }
        return result;
      }
      return null;
    }

    return parsed;
  } catch (error) {
    logger.warn({ error, stdout: stdout.substring(0, 200) }, 'Failed to parse JSON output');

    // Try to extract result from non-JSON output
    // This can happen if there's an error or the output isn't properly formatted
    return {
      result: stdout,
    };
  }
}

/**
 * Type guard for AgentStructuredOutput
 */
function isAgentStructuredOutput(value: unknown): value is AgentStructuredOutput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // result is required
  if (typeof obj['result'] !== 'string') {
    return false;
  }

  // session_id is optional but must be string if present
  if (obj['session_id'] !== undefined && typeof obj['session_id'] !== 'string') {
    return false;
  }

  // usage is optional but must match structure if present
  if (obj['usage'] !== undefined) {
    if (typeof obj['usage'] !== 'object' || obj['usage'] === null) {
      return false;
    }
    const usage = obj['usage'] as Record<string, unknown>;
    if (typeof usage['input_tokens'] !== 'number' || typeof usage['output_tokens'] !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Extracts usage info from unknown object
 */
function extractUsageFromUnknown(
  value: unknown
): { input_tokens: number; output_tokens: number } | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const inputTokens = obj['input_tokens'] ?? obj['inputTokens'];
  const outputTokens = obj['output_tokens'] ?? obj['outputTokens'];

  if (typeof inputTokens === 'number' && typeof outputTokens === 'number') {
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  }

  return undefined;
}

/**
 * Extracts session ID from structured output
 */
export function extractSessionId(output: AgentStructuredOutput): string | null {
  return output.session_id ?? null;
}

/**
 * Extracts token usage from structured output and normalizes to TokenUsage format
 */
export function extractTokenUsage(output: AgentStructuredOutput): TokenUsage | null {
  if (!output.usage) {
    return null;
  }

  return {
    input: output.usage.input_tokens,
    output: output.usage.output_tokens,
  };
}

/**
 * Extracts the result text from structured output
 */
export function extractResult(output: AgentStructuredOutput): string {
  return output.result;
}

/**
 * Checks if the output indicates an error
 */
export function isErrorOutput(output: AgentStructuredOutput): boolean {
  const result = output.result.toLowerCase();
  return (
    result.includes('error:') ||
    result.includes('failed:') ||
    result.startsWith('error') ||
    result.includes('permission denied') ||
    result.includes('command not found')
  );
}

/**
 * Extracts error message from output if present
 */
export function extractErrorMessage(output: AgentStructuredOutput): string | null {
  if (!isErrorOutput(output)) {
    return null;
  }

  // Try to find error message pattern
  const errorPatterns = [
    /error:\s*(.+)/i,
    /failed:\s*(.+)/i,
    /exception:\s*(.+)/i,
  ];

  for (const pattern of errorPatterns) {
    const match = output.result.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return output.result;
}
