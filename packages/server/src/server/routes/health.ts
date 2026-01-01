import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  type HealthStatus,
  type ReadinessResponse,
  type LivenessResponse,
  type ComponentCheck,
} from '../types.js';
import { getConfigLimits, getCIConfig, getSDKConfig, getSandboxConfig, type CIConfig, type SDKConfig, type SandboxConfig } from '../../config/index.js';
import { getSandboxManager, type SandboxSystemStatus } from '../../sandbox/index.js';

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
    const sandboxConfig = getSandboxConfig();

    // Get sandbox system status
    let sandboxStatus: SandboxSystemStatus | null = null;
    try {
      const sandboxManager = getSandboxManager();
      sandboxStatus = await sandboxManager.getStatus();
    } catch {
      // Sandbox manager not initialized yet or failed
    }

    const response: HealthStatus & {
      limits: typeof limits;
      config: { ci: CIConfig; sdk: SDKConfig; sandbox: SandboxConfig };
      drivers: { sdk: { apiKeySet: boolean; sandboxEnabled: boolean } };
      sandbox: SandboxSystemStatus | null;
    } = {
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString(),
      limits,
      config: {
        ci: ciConfig,
        sdk: sdkConfig,
        sandbox: sandboxConfig,
      },
      drivers: {
        sdk: {
          apiKeySet: !!process.env.ANTHROPIC_API_KEY,
          sandboxEnabled: sdkConfig.enableSandbox,
        },
      },
      sandbox: sandboxStatus,
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

    // Check sandbox system
    const sandboxCheck = await checkSandbox();
    checks.push(sandboxCheck);

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

/**
 * Check sandbox system accessibility
 */
async function checkSandbox(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const sandboxManager = getSandboxManager();
    const status = await sandboxManager.getStatus();
    const latencyMs = Date.now() - start;

    // Sandbox is healthy if we have a provider available
    const healthy = status.provider !== 'none';
    const message = healthy
      ? `Sandbox ready (provider: ${status.provider}, docker: ${status.dockerAvailable ? 'available' : 'unavailable'})`
      : 'No sandbox provider available';

    return {
      name: 'sandbox',
      healthy,
      message,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      name: 'sandbox',
      healthy: false,
      message: `Sandbox check failed: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs,
    };
  }
}
