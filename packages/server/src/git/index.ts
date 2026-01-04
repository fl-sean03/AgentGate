/**
 * Git Module
 *
 * Provides Git-related utilities for repository operations.
 */

// Conflict Detector (v0.2.27 - Thrust 5: Merge Conflict Detection)
export {
  detectConflicts,
  getCurrentBranch,
  branchExists,
  getCommitDivergence,
  hasUncommittedChanges,
  getModifiedFiles,
  getUpstreamModifiedFiles,
  getPotentialConflictFiles,
  mightHaveConflicts,
  type FileConflict,
  type ConflictDetectionResult,
  type ConflictDetectorOptions,
} from './conflict-detector.js';
