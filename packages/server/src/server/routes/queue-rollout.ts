/**
 * Queue Rollout Routes (v0.2.22 - Phase 3: Gradual Rollout)
 *
 * Provides endpoints for monitoring gradual rollout of the new queue system:
 * - GET /api/v1/queue/rollout/status - Rollout status and configuration
 * - GET /api/v1/queue/rollout/comparison - Compare legacy vs new system metrics
 * - POST /api/v1/queue/rollout/config - Update rollout configuration
 *
 * @module server/routes/queue-rollout
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import { getQueueConfig } from '../../config/index.js';
import { getQueueManager } from '../../control-plane/queue-manager.js';
import { createLogger } from '../../utils/logger.js';
import type { QueueFacade, QueueFacadeStats } from '../../queue/index.js';

const logger = createLogger('routes:queue-rollout');

// =============================================================================
// Singleton for QueueFacade access
// =============================================================================

/**
 * Store the QueueFacade instance for route access.
 * Set by the serve command during initialization.
 */
let registeredFacade: QueueFacade | null = null;

/**
 * Register the QueueFacade instance for route access.
 * Called from serve command after facade is created.
 */
export function setQueueFacade(facade: QueueFacade): void {
  registeredFacade = facade;
  logger.info('QueueFacade registered for rollout routes');
}

/**
 * Get the registered QueueFacade instance.
 */
export function getRegisteredFacade(): QueueFacade | null {
  return registeredFacade;
}

/**
 * Clear the registered facade (for testing).
 */
export function clearQueueFacade(): void {
  registeredFacade = null;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Rollout status response
 */
export interface RolloutStatusResponse {
  /** Whether new queue system is enabled */
  enabled: boolean;
  /** Whether shadow mode is active */
  shadowMode: boolean;
  /** Current rollout percentage (0-100) */
  rolloutPercent: number;
  /** Current rollout phase */
  phase: 'disabled' | 'shadow' | 'partial' | 'full';
  /** Timestamp of status check */
  timestamp: string;
  /** Rollout counters from facade (if available) */
  counters?: {
    totalRouted: number;
    routedToLegacy: number;
    routedToNew: number;
    shadowMismatches: number;
  } | undefined;
  /** Recommended next action */
  recommendation?: string | undefined;
}

/**
 * System comparison metrics
 */
export interface SystemMetrics {
  /** Queue depth (waiting items) */
  queueDepth: number;
  /** Running items count */
  runningCount: number;
  /** Whether system is accepting new items */
  accepting: boolean;
  /** System health status */
  health: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Rollout comparison response
 */
export interface RolloutComparisonResponse {
  /** Legacy system metrics */
  legacy: SystemMetrics;
  /** New system metrics (if available) */
  newSystem: SystemMetrics | null;
  /** Whether systems are in sync */
  inSync: boolean;
  /** List of differences if not in sync */
  differences: string[];
  /** Shadow mode mismatch count */
  shadowMismatches: number;
  /** Timestamp of comparison */
  timestamp: string;
  /** Comparison verdict */
  verdict: 'match' | 'minor_diff' | 'major_diff' | 'new_unavailable';
}

/**
 * Rollout config update request
 */
const rolloutConfigUpdateSchema = z.object({
  /** New rollout percentage (0-100) */
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  /** Enable/disable shadow mode */
  shadowMode: z.boolean().optional(),
  /** Enable/disable new queue system */
  useNewQueueSystem: z.boolean().optional(),
});

type RolloutConfigUpdate = z.infer<typeof rolloutConfigUpdateSchema>;

/**
 * Rollout config update response
 */
export interface RolloutConfigUpdateResponse {
  /** Whether update was successful */
  updated: boolean;
  /** New phase after update */
  newPhase: RolloutStatusResponse['phase'];
  /** Applied updates */
  appliedUpdates: RolloutConfigUpdate;
  /** Warning about persistence */
  warning: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine the current rollout phase based on configuration
 */
function determinePhase(config: {
  useNewQueueSystem: boolean;
  shadowMode: boolean;
  rolloutPercent: number;
}): RolloutStatusResponse['phase'] {
  if (!config.useNewQueueSystem && config.rolloutPercent === 0 && !config.shadowMode) {
    return 'disabled';
  }
  if (config.shadowMode) {
    return 'shadow';
  }
  if (config.rolloutPercent > 0 && config.rolloutPercent < 100) {
    return 'partial';
  }
  if (config.rolloutPercent >= 100 && config.useNewQueueSystem) {
    return 'full';
  }
  return 'disabled';
}

/**
 * Generate a recommendation based on current rollout state
 */
function generateRecommendation(
  phase: RolloutStatusResponse['phase'],
  rolloutPercent: number,
  shadowMismatches: number
): string | undefined {
  if (phase === 'disabled') {
    return 'Enable shadow mode to start testing new system';
  }
  if (phase === 'shadow') {
    if (shadowMismatches > 0) {
      return `${shadowMismatches} mismatches detected. Investigate before proceeding.`;
    }
    return 'Shadow mode stable. Consider enabling partial rollout (10%)';
  }
  if (phase === 'partial') {
    if (rolloutPercent < 50) {
      return `Current: ${rolloutPercent}%. Consider increasing to 50% if stable.`;
    }
    if (rolloutPercent < 100) {
      return `Current: ${rolloutPercent}%. Consider full rollout (100%) if stable.`;
    }
  }
  if (phase === 'full') {
    return 'Full rollout complete. Consider removing legacy system.';
  }
  return undefined;
}

/**
 * Compare two system metrics and find differences
 */
function compareMetrics(
  legacy: SystemMetrics,
  newSystem: SystemMetrics
): { differences: string[]; verdict: RolloutComparisonResponse['verdict'] } {
  const differences: string[] = [];

  // Queue depth difference
  const queueDiff = Math.abs(legacy.queueDepth - newSystem.queueDepth);
  if (queueDiff > 0) {
    differences.push(`Queue depth: legacy=${legacy.queueDepth}, new=${newSystem.queueDepth}`);
  }

  // Running count difference
  const runningDiff = Math.abs(legacy.runningCount - newSystem.runningCount);
  if (runningDiff > 0) {
    differences.push(`Running count: legacy=${legacy.runningCount}, new=${newSystem.runningCount}`);
  }

  // Accepting state difference
  if (legacy.accepting !== newSystem.accepting) {
    differences.push(`Accepting: legacy=${legacy.accepting}, new=${newSystem.accepting}`);
  }

  // Health difference
  if (legacy.health !== newSystem.health) {
    differences.push(`Health: legacy=${legacy.health}, new=${newSystem.health}`);
  }

  // Determine verdict
  let verdict: RolloutComparisonResponse['verdict'] = 'match';
  if (differences.length > 0) {
    // Major differences: accepting state or health mismatch
    if (legacy.accepting !== newSystem.accepting || legacy.health !== newSystem.health) {
      verdict = 'major_diff';
    } else {
      verdict = 'minor_diff';
    }
  }

  return { differences, verdict };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * Register queue rollout routes
 */
export function registerQueueRolloutRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/queue/rollout/status - Get rollout status
   *
   * Returns current rollout configuration and phase.
   */
  app.get('/api/v1/queue/rollout/status', async (request, reply) => {
    try {
      const config = getQueueConfig();

      // Try to get counters from the facade if available
      let counters: RolloutStatusResponse['counters'] | undefined;
      const facade = getRegisteredFacade();
      if (facade) {
        const stats = facade.getStats();
        counters = stats.counters;
      }

      const phase = determinePhase(config);
      const recommendation = generateRecommendation(
        phase,
        config.rolloutPercent,
        counters?.shadowMismatches ?? 0
      );

      const response: RolloutStatusResponse = {
        enabled: config.useNewQueueSystem,
        shadowMode: config.shadowMode,
        rolloutPercent: config.rolloutPercent,
        phase,
        timestamp: new Date().toISOString(),
        counters,
        recommendation,
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get rollout status');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get rollout status',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/queue/rollout/comparison - Compare legacy vs new system
   *
   * Returns side-by-side comparison of metrics from both systems.
   */
  app.get('/api/v1/queue/rollout/comparison', async (request, reply) => {
    try {
      const queueManager = getQueueManager();
      const legacyStats = queueManager.getStats();

      // Build legacy metrics
      const legacy: SystemMetrics = {
        queueDepth: legacyStats.waiting,
        runningCount: legacyStats.running,
        accepting: legacyStats.accepting,
        health: legacyStats.accepting ? 'healthy' : 'unhealthy',
      };

      // Try to get new system metrics from the facade
      let newSystem: SystemMetrics | null = null;
      let shadowMismatches = 0;

      const facade = getRegisteredFacade();
      if (facade) {
        const facadeStats: QueueFacadeStats = facade.getStats();

        if (facadeStats.newSystemStats) {
          const ns = facadeStats.newSystemStats;
          newSystem = {
            queueDepth: ns.queueDepth,
            runningCount: ns.activeSlots,
            accepting: ns.availableSlots > 0,
            health: ns.availableSlots > 0 ? 'healthy' : 'degraded',
          };
        }

        shadowMismatches = facadeStats.counters.shadowMismatches;
      }

      // Build response
      let inSync = false;
      let differences: string[] = [];
      let verdict: RolloutComparisonResponse['verdict'] = 'new_unavailable';

      if (newSystem) {
        const comparison = compareMetrics(legacy, newSystem);
        differences = comparison.differences;
        verdict = comparison.verdict;
        inSync = differences.length === 0;
      }

      const response: RolloutComparisonResponse = {
        legacy,
        newSystem,
        inSync,
        differences,
        shadowMismatches,
        timestamp: new Date().toISOString(),
        verdict,
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get rollout comparison');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get rollout comparison',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * POST /api/v1/queue/rollout/config - Update rollout configuration
   *
   * Allows dynamic updates to rollout settings.
   * NOTE: Changes are in-memory only; persistent changes require env vars.
   */
  app.post<{
    Body: RolloutConfigUpdate;
  }>('/api/v1/queue/rollout/config', async (request, reply) => {
    try {
      // Validate request body
      const bodyResult = rolloutConfigUpdateSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid configuration update',
            { errors: bodyResult.error.errors },
            request.id
          )
        );
      }

      const updates = bodyResult.data;

      // Try to update the facade configuration
      const facade = getRegisteredFacade();
      if (!facade) {
        return reply.status(503).send(
          createErrorResponse(
            ErrorCode.SERVICE_UNAVAILABLE,
            'Queue facade not available. New queue system may not be initialized.',
            undefined,
            request.id
          )
        );
      }

      // Build clean config object without undefined values to satisfy exactOptionalPropertyTypes
      const cleanUpdates: {
        useNewQueueSystem?: boolean;
        shadowMode?: boolean;
        rolloutPercent?: number;
      } = {};
      if (updates.useNewQueueSystem !== undefined) {
        cleanUpdates.useNewQueueSystem = updates.useNewQueueSystem;
      }
      if (updates.shadowMode !== undefined) {
        cleanUpdates.shadowMode = updates.shadowMode;
      }
      if (updates.rolloutPercent !== undefined) {
        cleanUpdates.rolloutPercent = updates.rolloutPercent;
      }

      facade.updateConfig(cleanUpdates);

      logger.info(
        { updates, requestId: request.id },
        'Rollout configuration updated'
      );

      // Get the new status
      const config = getQueueConfig();
      const phase = determinePhase({
        useNewQueueSystem: updates.useNewQueueSystem ?? config.useNewQueueSystem,
        shadowMode: updates.shadowMode ?? config.shadowMode,
        rolloutPercent: updates.rolloutPercent ?? config.rolloutPercent,
      });

      const response: RolloutConfigUpdateResponse = {
        updated: true,
        newPhase: phase,
        appliedUpdates: updates,
        warning: 'Changes are in-memory only. Set environment variables for persistence.',
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to update rollout config');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to update rollout configuration',
          undefined,
          request.id
        )
      );
    }
  });

  logger.info('Queue rollout routes registered');
}
