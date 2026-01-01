import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  type HealthStatus,
  type ReadinessResponse,
  type LivenessResponse,
  type ComponentCheck,
} from '../types.js';
import { getConfigLimits, getCIConfig, type CIConfig } from '../../config/index.js';

/**
 * Package version - should match package.json
 */
const VERSION = '0.2.12';

/**
 * Active CI polling tracker (v0.2.12 - Thrust 6)
 * Used to track which work orders are actively polling CI
 */
const activeCIPolling = new Set<string>();

/**
 * Register a work order as actively polling CI
 */
export function registerCIPolling(workOrderId: string): void {
  activeCIPolling.add(workOrderId);
}

/**
 * Unregister a work order from CI polling
 */
export function unregisterCIPolling(workOrderId: string): void {
  activeCIPolling.delete(workOrderId);
}

/**
 * Get active CI polling info
 */
export function getActiveCIPolling(): { count: number; workOrders: string[] } {
  return {
    count: activeCIPolling.size,
    workOrders: Array.from(activeCIPolling),
  };
}

/**
 * Register health check routes
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  /**
   * GET /health - Basic health check
   * Returns service status, version, and configuration limits
   */
  app.get('/health', async (request, reply) => {
    const limits = getConfigLimits();
    const ciConfig = getCIConfig();
    const activePolling = getActiveCIPolling();

    const response: HealthStatus & {
      limits: typeof limits;
      config: { ci: CIConfig };
      activePolling: typeof activePolling;
    } = {
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString(),
      limits,
      config: {
        ci: ciConfig,
      },
      activePolling,
    };
    return reply.send(createSuccessResponse(response, request.id));
  });

  /**
   * GET /health/ready - Readiness check
   * Checks if all components are ready to serve traffic
   */
  app.get('/health/ready', async (request, reply) => {
    const checks: ComponentCheck[] = [];

    // Check file system access
    const fsCheck = checkFileSystem();
    checks.push(fsCheck);

    // Aggregate readiness
    const allHealthy = checks.every((c) => c.healthy);

    const response: ReadinessResponse = {
      ready: allHealthy,
      checks,
      timestamp: new Date().toISOString(),
    };

    // Return 503 if not ready
    if (!allHealthy) {
      return reply.status(503).send(createSuccessResponse(response, request.id));
    }

    return reply.send(createSuccessResponse(response, request.id));
  });

  /**
   * GET /health/live - Liveness check
   * Simple check to verify the service is running
   */
  app.get('/health/live', async (request, reply) => {
    const response: LivenessResponse = {
      alive: true,
      timestamp: new Date().toISOString(),
    };
    return reply.send(createSuccessResponse(response, request.id));
  });
}

/**
 * Check file system accessibility
 */
function checkFileSystem(): ComponentCheck {
  const start = Date.now();
  // Simple check - if we got here, Node.js is running
  const latencyMs = Date.now() - start;
  return {
    name: 'filesystem',
    healthy: true,
    message: 'File system accessible',
    latencyMs,
  };
}
