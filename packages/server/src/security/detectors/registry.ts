/**
 * Detector Registry
 *
 * Central registry for security detectors. Maintains a map of detector types
 * to their implementations and provides lookup functionality.
 */

import { logger } from '../../utils/logger.js';
import type { Detector } from './types.js';
import { ContentDetector } from './content-detector.js';
import { EntropyDetector } from './entropy-detector.js';
import { PatternDetector } from './pattern-detector.js';
import { GitignoreDetector } from './gitignore-detector.js';

// ============================================================================
// Detector Registry
// ============================================================================

/**
 * Registry for managing security detectors.
 */
export class DetectorRegistry {
  private detectors: Map<string, Detector> = new Map();

  constructor() {
    // Initialize empty - detectors will be registered below
  }

  /**
   * Register a detector.
   * Logs a warning if overwriting an existing detector.
   */
  register(detector: Detector): void {
    if (this.detectors.has(detector.type)) {
      logger.warn(
        { type: detector.type },
        `Overwriting existing detector of type: ${detector.type}`
      );
    }
    this.detectors.set(detector.type, detector);
    logger.debug(
      { type: detector.type, name: detector.name },
      `Registered detector: ${detector.name}`
    );
  }

  /**
   * Get a detector by type.
   * Returns undefined if not found.
   */
  get(type: string): Detector | undefined {
    return this.detectors.get(type);
  }

  /**
   * Get all registered detectors.
   */
  all(): Detector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * Check if a detector type is registered.
   */
  has(type: string): boolean {
    return this.detectors.has(type);
  }

  /**
   * Get the number of registered detectors.
   */
  get size(): number {
    return this.detectors.size;
  }

  /**
   * Get all registered detector types.
   */
  types(): string[] {
    return Array.from(this.detectors.keys());
  }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

/**
 * Global detector registry singleton.
 * Pre-populated with all built-in detectors.
 */
export const detectorRegistry = new DetectorRegistry();

// Register built-in detectors
detectorRegistry.register(new ContentDetector());
detectorRegistry.register(new EntropyDetector());
detectorRegistry.register(new PatternDetector());
detectorRegistry.register(new GitignoreDetector());
