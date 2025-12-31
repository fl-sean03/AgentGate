export type RunStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export type VerificationLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type VerificationStatus = 'passed' | 'failed' | 'skipped';

export interface VerificationResult {
  level: VerificationLevel;
  status: VerificationStatus;
  test_name?: string;
  command?: string;
  output?: string;
  error_message?: string;
  duration_ms?: number;
}

export interface VerificationReport {
  L0?: VerificationResult[];
  L1?: VerificationResult[];
  L2?: VerificationResult[];
  L3?: VerificationResult[];
  overall_status: VerificationStatus;
  total_duration_ms: number;
}

export interface Iteration {
  id: string;
  run_id: string;
  iteration_number: number;
  started_at: string;
  completed_at?: string;
  status: RunStatus;
  agent_actions?: {
    type: string;
    description: string;
    timestamp: string;
  }[];
  verification_report?: VerificationReport;
  error_message?: string;
}

export interface Run {
  id: string;
  work_order_id: string;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  iterations: Iteration[];
  final_verification?: VerificationReport;
  error_message?: string;
  total_iterations: number;
}
