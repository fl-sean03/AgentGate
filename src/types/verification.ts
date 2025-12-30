// Verification Level
export const VerificationLevel = {
  L0: 'L0',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
} as const;

export type VerificationLevel = (typeof VerificationLevel)[keyof typeof VerificationLevel];

// Level Result
export interface LevelResult {
  level: VerificationLevel;
  passed: boolean;
  checks: CheckResult[];
  duration: number;
}

// Check Result
export interface CheckResult {
  name: string;
  passed: boolean;
  message: string | null;
  details: string | null;
}

// Test Result (L1)
export interface TestResult {
  name: string;
  command: string;
  exitCode: number;
  expectedExit: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

// Blackbox Result (L2)
export interface BlackboxResult {
  name: string;
  fixture: string;
  passed: boolean;
  assertions: AssertionResult[];
  actualOutput: string;
  duration: number;
}

// Assertion Result
export interface AssertionResult {
  type: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message: string | null;
}

// Diagnostic
export interface Diagnostic {
  level: VerificationLevel;
  type: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}

// Verification Report
export interface VerificationReport {
  id: string;
  snapshotId: string;
  runId: string;
  iteration: number;
  passed: boolean;
  l0Result: LevelResult;
  l1Result: LevelResult;
  l2Result: LevelResult;
  l3Result: LevelResult;
  logs: string;
  diagnostics: Diagnostic[];
  totalDuration: number;
  createdAt: Date;
}

// Clean Room
export interface CleanRoom {
  id: string;
  snapshotId: string;
  workDir: string;
  envDir: string | null;
  runtime: 'node' | 'python' | 'generic';
  runtimeVersion: string | null;
  createdAt: Date;
  env: Record<string, string>;
}

// Command Result
export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
  killed: boolean;
}
