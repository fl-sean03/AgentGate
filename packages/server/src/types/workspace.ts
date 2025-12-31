import type { WorkspaceSource } from './work-order.js';

// Workspace Status
export const WorkspaceStatus = {
  AVAILABLE: 'available',
  LEASED: 'leased',
  ERROR: 'error',
} as const;

export type WorkspaceStatus = (typeof WorkspaceStatus)[keyof typeof WorkspaceStatus];

// Workspace
export interface Workspace {
  id: string;
  rootPath: string;
  source: WorkspaceSource;
  leaseId: string | null;
  leasedAt: Date | null;
  status: WorkspaceStatus;
  gitInitialized: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Lease
export interface Lease {
  id: string;
  workspaceId: string;
  runId: string;
  acquiredAt: Date;
  expiresAt: Date;
  lastRefreshedAt: Date;
}

// Path Policy
export interface PathPolicy {
  rootPath: string;
  allowedPaths: string[];
  forbiddenPatterns: string[];
  maxFileSize: number;
}

// Validation Result
export interface ValidationResult {
  valid: boolean;
  violations: PathViolation[];
}

export interface PathViolation {
  path: string;
  reason: 'outside_root' | 'forbidden_pattern' | 'file_too_large';
  details: string;
}
