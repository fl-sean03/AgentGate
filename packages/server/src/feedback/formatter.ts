import type { StructuredFeedback } from '../types/index.js';

const MAX_TOTAL_LENGTH = 4000;
const MAX_FAILURE_DETAIL_LENGTH = 500;

export function formatForAgent(feedback: StructuredFeedback): string {
  const parts: string[] = [];

  // Header
  parts.push(`## Verification Failed - Iteration ${feedback.iteration}`);
  parts.push('');

  // Summary
  parts.push('### Summary');
  parts.push(feedback.summary);
  parts.push('');

  // Failed level
  parts.push(`### Failed at Level: ${feedback.failedLevel}`);
  parts.push('');

  // Failures
  parts.push('### Failures');
  parts.push('');

  for (let i = 0; i < feedback.failures.length; i++) {
    const failure = feedback.failures[i];
    if (!failure) continue;

    parts.push(`#### Failure ${i + 1}: ${failure.type}`);
    parts.push(`- **Message**: ${failure.message}`);

    if (failure.file) {
      parts.push(`- **File**: ${failure.file}${failure.line ? `:${failure.line}` : ''}`);
    }
    if (failure.command) {
      parts.push(`- **Command**: ${failure.command}`);
    }
    if (failure.exitCode !== null) {
      parts.push(`- **Exit Code**: ${failure.exitCode}`);
    }
    if (failure.expected) {
      parts.push(`- **Expected**: ${failure.expected}`);
    }
    if (failure.actual) {
      parts.push(`- **Actual**: ${failure.actual}`);
    }
    if (failure.details) {
      parts.push('');
      parts.push('```');
      parts.push(truncate(failure.details, MAX_FAILURE_DETAIL_LENGTH));
      parts.push('```');
    }

    parts.push('');
    parts.push('---');
    parts.push('');
  }

  // Files to review
  if (feedback.fileReferences.length > 0) {
    parts.push('### Files to Review');
    for (const ref of feedback.fileReferences) {
      parts.push(`- ${ref.path}: ${ref.reason}`);
    }
    parts.push('');
  }

  // Suggestions
  if (feedback.suggestions.length > 0) {
    parts.push('### Suggestions');
    for (let i = 0; i < feedback.suggestions.length; i++) {
      parts.push(`${i + 1}. ${feedback.suggestions[i]}`);
    }
    parts.push('');
  }

  // Instructions
  parts.push('### Instructions');
  parts.push('Please fix the issues above and ensure all tests pass before completing.');
  parts.push('Do not modify the gate plan or test fixtures.');
  parts.push('Run the failing commands locally to verify your fix.');

  let result = parts.join('\n');

  // Truncate if too long
  if (result.length > MAX_TOTAL_LENGTH) {
    result = result.slice(0, MAX_TOTAL_LENGTH - 20) + '\n\n... (truncated)';
  }

  return result;
}

export function formatForHuman(feedback: StructuredFeedback): string {
  const parts: string[] = [];

  // Header with color indicators
  parts.push('╔════════════════════════════════════════════════════════════════╗');
  parts.push(`║  VERIFICATION FAILED - Iteration ${feedback.iteration}`.padEnd(66) + '║');
  parts.push('╚════════════════════════════════════════════════════════════════╝');
  parts.push('');

  parts.push(`Level: ${feedback.failedLevel}`);
  parts.push('');
  parts.push(feedback.summary);
  parts.push('');

  parts.push('─'.repeat(68));
  parts.push('FAILURES:');
  parts.push('');

  for (const failure of feedback.failures) {
    parts.push(`  ✗ [${failure.type}] ${failure.message}`);
    if (failure.file) {
      parts.push(`    at ${failure.file}${failure.line ? `:${failure.line}` : ''}`);
    }
  }

  parts.push('');
  parts.push('─'.repeat(68));
  parts.push('SUGGESTIONS:');
  parts.push('');

  for (const suggestion of feedback.suggestions) {
    parts.push(`  → ${suggestion}`);
  }

  return parts.join('\n');
}

export function formatForJson(feedback: StructuredFeedback): string {
  return JSON.stringify(feedback, null, 2);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
