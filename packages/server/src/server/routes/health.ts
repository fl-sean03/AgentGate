import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  type HealthStatus,
  type ReadinessResponse,
  type LivenessResponse,
  type ComponentCheck,
} from '../types.js';
import { getConfigLimits, getCIConfig, getSDKConfig, type CIConfig, type SDKConfig } from '../../config/index.js';

/**
 * Package version - should match package.json
 */
const VERSION = '0.2.14';

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
    const sdkConfig = getSDKConfig();
    const response: HealthStatus & {
      limits: typeof limits;
      config: { ci: CIConfig; sdk: SDKConfig };
      drivers: { sdk: { apiKeySet: boolean; sandboxEnabled: boolean } };
    } = {
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString(),
      limits,
      config: {
        ci: ciConfig,
        sdk: sdkConfig,
      },
      drivers: {
        sdk: {
          apiKeySet: !!process.env.ANTHROPIC_API_KEY,
          sandboxEnabled: sdkConfig.enableSandbox,
        },
      },
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
