/**
 * Verifier module.
 * Provides verification capabilities for agent outputs.
 */

// Types
export type {
  VerifyOptions,
  VerifyContext,
  Diagnostic,
  ContractCheckResult,
  ExecutionResult,
} from './types.js';

// Main verifier
export { verify, verifyLevel, type VerifyWithMetadataOptions } from './verifier.js';

// Clean-room
export {
  createCleanRoom,
  teardownCleanRoom,
  runInCleanRoom,
} from './clean-room.js';

// Individual levels (for advanced use)
export { verifyL0 } from './l0-contracts.js';
export { verifyL1 } from './l1-tests.js';
export { verifyL2 } from './l2-blackbox.js';
export { verifyL3 } from './l3-sanity.js';
