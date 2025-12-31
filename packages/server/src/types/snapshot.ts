// Before State (captured before BUILD)
export interface BeforeState {
  sha: string;
  branch: string;
  isDirty: boolean;
  capturedAt: Date;
}

// Snapshot
export interface Snapshot {
  id: string;
  runId: string;
  iteration: number;
  beforeSha: string;
  afterSha: string;
  branch: string;
  commitMessage: string;
  patchPath: string | null;
  filesChanged: number;
  insertions: number;
  deletions: number;
  createdAt: Date;
}

// Commit Info
export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: Date;
  parents: string[];
}

// Diff Stats
export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: FileChange[];
}

// File Change
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  insertions: number;
  deletions: number;
}
