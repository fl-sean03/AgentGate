/**
 * Security Detectors
 *
 * Public API for security detectors module.
 */

// Types
export type {
  Detector,
  DetectorContext,
  DetectorFinding,
  ValidationResult,
} from './types.js';

// Patterns
export {
  BUILTIN_SECRET_PATTERNS,
  compilePatterns,
  getCompiledBuiltinPatterns,
  type CompiledPattern,
} from './patterns.js';

// Content Detector
export {
  ContentDetector,
  DEFAULT_BINARY_EXTENSIONS,
  type ContentDetectorOptions,
} from './content-detector.js';

// Entropy Detector
export {
  EntropyDetector,
  type EntropyDetectorOptions,
  type CharsetType,
} from './entropy-detector.js';

// Pattern Detector
export {
  PatternDetector,
  DEFAULT_SENSITIVE_PATTERNS,
  type PatternDetectorOptions,
} from './pattern-detector.js';

// Gitignore Detector
export {
  GitignoreDetector,
  type GitignoreDetectorOptions,
  type GitignoreTreatment,
} from './gitignore-detector.js';

// Registry
export { DetectorRegistry, detectorRegistry } from './registry.js';
