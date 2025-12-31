import { FailureType, type Failure, type SuggestionPattern } from '../types/index.js';

const SUGGESTION_PATTERNS: SuggestionPattern[] = [
  {
    pattern: /file not found|no such file/i,
    failureType: FailureType.MISSING_FILE,
    template: 'Create the missing file: {file}',
  },
  {
    pattern: /module not found|cannot find module/i,
    failureType: FailureType.BUILD_ERROR,
    template: 'Check imports in {file}, ensure the module is installed',
  },
  {
    pattern: /type error|typescript/i,
    failureType: FailureType.BUILD_ERROR,
    template: 'Fix the type error in {file}:{line}',
  },
  {
    pattern: /expected .+ (but )?got/i,
    failureType: FailureType.TEST_FAILED,
    template:
      'Update {file} to produce the expected output, or update the test if the new behavior is intentional',
  },
  {
    pattern: /timeout|timed out/i,
    failureType: FailureType.TEST_TIMEOUT,
    template: 'Optimize the operation or increase the timeout if the slow execution is expected',
  },
  {
    pattern: /forbidden|not allowed/i,
    failureType: FailureType.FORBIDDEN_FILE,
    template: 'Remove {path} or add it to .gitignore if needed locally',
  },
  {
    pattern: /schema validation|invalid json/i,
    failureType: FailureType.SCHEMA_VIOLATION,
    template: 'Fix the schema violation in {file}: {message}',
  },
  {
    pattern: /assertion failed|assert/i,
    failureType: FailureType.ASSERTION_FAILED,
    template: 'Review the assertion in {file} and fix the underlying issue',
  },
  {
    pattern: /permission denied|access denied/i,
    failureType: FailureType.RUNTIME_ERROR,
    template: 'Check file permissions for {file}',
  },
  {
    pattern: /out of memory|memory limit/i,
    failureType: FailureType.RESOURCE_EXCEEDED,
    template: 'Reduce memory usage or optimize the operation',
  },
];

export function generateSuggestions(failures: Failure[]): string[] {
  const suggestions: Set<string> = new Set();

  for (const failure of failures) {
    const suggestion = generateSuggestionForFailure(failure);
    if (suggestion) {
      suggestions.add(suggestion);
    }
  }

  // Add general suggestions based on failure types
  const failureTypes = new Set(failures.map((f) => f.type));

  if (failureTypes.has(FailureType.MISSING_FILE)) {
    suggestions.add('Ensure all required files exist before running verification');
  }

  if (failureTypes.has(FailureType.TEST_FAILED)) {
    suggestions.add('Run the failing tests locally to understand the exact failure');
  }

  if (failureTypes.has(FailureType.SCHEMA_VIOLATION)) {
    suggestions.add('Check the schema requirements in verify.yaml');
  }

  return Array.from(suggestions).slice(0, 5); // Max 5 suggestions
}

function generateSuggestionForFailure(failure: Failure): string | null {
  const message = failure.message + (failure.details ?? '');

  for (const pattern of SUGGESTION_PATTERNS) {
    if (pattern.pattern.test(message)) {
      return interpolateSuggestion(pattern.template, failure);
    }
  }

  // Default suggestions by failure type
  switch (failure.type) {
    case FailureType.MISSING_FILE:
      return failure.file ? `Create the missing file: ${failure.file}` : null;
    case FailureType.TEST_FAILED:
      return failure.command ? `Fix the failing test: ${failure.command}` : null;
    case FailureType.FORBIDDEN_FILE:
      return failure.file ? `Remove the forbidden file: ${failure.file}` : null;
    default:
      return null;
  }
}

function interpolateSuggestion(template: string, failure: Failure): string {
  return template
    .replace('{file}', failure.file ?? 'the affected file')
    .replace('{line}', failure.line?.toString() ?? '?')
    .replace('{path}', failure.file ?? 'the file')
    .replace('{message}', failure.message.slice(0, 50))
    .replace('{command}', failure.command ?? 'the command');
}
