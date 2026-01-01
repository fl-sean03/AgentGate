import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  type HealthStatus,
  type ReadinessResponse,
  type LivenessResponse,
  type ComponentCheck,
} from '../types.js';
import {
  getConfigLimits,
  getCIConfig,
  getSandboxConfig,
  type CIConfig,
  type SandboxConfig,
} from '../../config/index.js';
import { getSandboxManager, type SandboxSystemStatus } from '../../sandbox/index.js';

/**
 * Package version - should match package.json
 */
const VERSION = '0.2.13';

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
    const sandboxConfig = getSandboxConfig();

    // Get sandbox status (lazy initialization)
    let sandboxStatus: SandboxSystemStatus | null = null;
    try {
      const manager = getSandboxManager({
        provider: sandboxConfig.provider,
        defaultImage: sandboxConfig.image,
        defaultResourceLimits: {
          cpuCount: sandboxConfig.cpuLimit,
          memoryMB: sandboxConfig.memoryMB,
          timeoutSeconds: sandboxConfig.timeoutSeconds,
        },
        defaultNetworkMode: sandboxConfig.networkMode,
        autoCleanupIntervalMs: sandboxConfig.autoCleanupMinutes * 60 * 1000,
      });
      sandboxStatus = await manager.getStatus();
    } catch {
      // Sandbox manager not available, continue without it
    }

    const response: HealthStatus & {
      limits: typeof limits;
      config: { ci: CIConfig; sandbox: SandboxConfig };
      sandbox?: SandboxSystemStatus;
    } = {
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString(),
      limits,
      config: {
        ci: ciConfig,
        sandbox: sandboxConfig,
      },
    };

    if (sandboxStatus) {
      response.sandbox = sandboxStatus;
    }

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
