/**
 * Verification Plugin Routes
 *
 * API endpoints for managing verification plugins.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
} from '../types.js';
import {
  defaultPluginRegistry,
  defaultPluginRunner,
  type PluginConfig,
  type VerificationPlugin,
  type VerificationContext,
  type CombinedVerificationResult,
} from '../../verifier/plugins/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('plugins-routes');

/**
 * Plugin registration request body
 */
interface RegisterPluginBody {
  id: string;
  name: string;
  description?: string;
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'custom';
  priority?: number;
  enabled?: boolean;
  continueOnFail?: boolean;
  options?: Record<string, unknown>;
  /** URL to call for verification (webhook-based plugin) */
  webhookUrl?: string;
  /** Timeout for webhook call in ms */
  webhookTimeoutMs?: number;
}

/**
 * Run plugins request body
 */
interface RunPluginsBody {
  workDir: string;
  taskPrompt?: string;
  modifiedFiles?: string[];
  harness?: string;
  levels?: Array<'L0' | 'L1' | 'L2' | 'L3' | 'custom'>;
  timeoutMs?: number;
  pluginIds?: string[];
}

/**
 * Create a webhook-based plugin from configuration
 */
function createWebhookPlugin(config: RegisterPluginBody): VerificationPlugin {
  const pluginConfig: PluginConfig = {
    id: config.id,
    name: config.name,
    description: config.description,
    level: config.level || 'custom',
    priority: config.priority ?? 100,
    enabled: config.enabled ?? true,
    continueOnFail: config.continueOnFail ?? false,
    options: config.options,
  };

  return {
    config: pluginConfig,

    shouldRun: (_context: VerificationContext) => {
      return pluginConfig.enabled;
    },

    verify: async (context: VerificationContext) => {
      const startTime = Date.now();

      if (!config.webhookUrl) {
        return {
          pluginId: config.id,
          status: 'error' as const,
          level: pluginConfig.level,
          summary: 'No webhook URL configured',
          checks: [],
          durationMs: Date.now() - startTime,
          error: 'Plugin requires a webhookUrl',
        };
      }

      try {
        const controller = new AbortController();
        const timeoutMs = config.webhookTimeoutMs || 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pluginId: config.id,
            context: {
              workDir: context.workDir,
              modifiedFiles: context.modifiedFiles,
              harness: context.harness,
              metadata: context.metadata,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            pluginId: config.id,
            status: 'error' as const,
            level: pluginConfig.level,
            summary: `Webhook returned ${response.status}`,
            checks: [],
            durationMs: Date.now() - startTime,
            error: `HTTP ${response.status}`,
          };
        }

        const result = await response.json() as {
          status?: 'passed' | 'failed' | 'skipped' | 'warning' | 'error';
          summary?: string;
          checks?: Array<{
            name: string;
            status: 'passed' | 'failed' | 'skipped' | 'warning' | 'error';
            message?: string;
            details?: string;
          }>;
          error?: string;
        };

        return {
          pluginId: config.id,
          status: result.status || 'passed',
          level: pluginConfig.level,
          summary: result.summary || 'Verification complete',
          checks: result.checks || [],
          durationMs: Date.now() - startTime,
          error: result.error,
          continueOnFail: pluginConfig.continueOnFail,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
          pluginId: config.id,
          status: 'error' as const,
          level: pluginConfig.level,
          summary: 'Webhook call failed',
          checks: [],
          durationMs,
          error: errorMessage,
        };
      }
    },
  };
}

/**
 * Register plugin routes
 */
export function registerPluginRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/verification/plugins - List all registered plugins
   */
  app.get('/api/v1/verification/plugins', async (request, reply) => {
    try {
      const plugins = defaultPluginRegistry.getAll();

      const response = plugins.map((plugin: VerificationPlugin) => ({
        id: plugin.config.id,
        name: plugin.config.name,
        description: plugin.config.description,
        level: plugin.config.level,
        priority: plugin.config.priority,
        enabled: plugin.config.enabled,
        continueOnFail: plugin.config.continueOnFail,
        options: plugin.config.options,
      }));

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ error }, 'Failed to list plugins');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to list plugins',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/verification/plugins/:id - Get a specific plugin
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/verification/plugins/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const plugin = defaultPluginRegistry.get(id);

        if (!plugin) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Plugin '${id}' not found`,
              undefined,
              request.id
            )
          );
        }

        const response = {
          id: plugin.config.id,
          name: plugin.config.name,
          description: plugin.config.description,
          level: plugin.config.level,
          priority: plugin.config.priority,
          enabled: plugin.config.enabled,
          continueOnFail: plugin.config.continueOnFail,
          options: plugin.config.options,
        };

        return reply.send(createSuccessResponse(response, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to get plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to get plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * POST /api/v1/verification/plugins - Register a new plugin
   */
  app.post<{ Body: RegisterPluginBody }>(
    '/api/v1/verification/plugins',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            level: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'custom'] },
            priority: { type: 'number', minimum: 0 },
            enabled: { type: 'boolean' },
            continueOnFail: { type: 'boolean' },
            options: { type: 'object' },
            webhookUrl: { type: 'string', format: 'uri' },
            webhookTimeoutMs: { type: 'number', minimum: 1000, maximum: 300000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body;

        // Check if plugin already exists
        if (defaultPluginRegistry.has(body.id)) {
          return reply.status(409).send(
            createErrorResponse(
              ErrorCode.CONFLICT,
              `Plugin '${body.id}' already registered`,
              undefined,
              request.id
            )
          );
        }

        // Create and register the plugin
        const plugin = createWebhookPlugin(body);
        defaultPluginRegistry.register(plugin);

        logger.info({ pluginId: body.id }, 'Plugin registered');

        const response = {
          id: plugin.config.id,
          name: plugin.config.name,
          description: plugin.config.description,
          level: plugin.config.level,
          priority: plugin.config.priority,
          enabled: plugin.config.enabled,
          continueOnFail: plugin.config.continueOnFail,
          options: plugin.config.options,
        };

        return reply.status(201).send(createSuccessResponse(response, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to register plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to register plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * PATCH /api/v1/verification/plugins/:id - Update a plugin
   */
  app.patch<{ Params: { id: string }; Body: Partial<RegisterPluginBody> }>(
    '/api/v1/verification/plugins/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const body = request.body;

        const existing = defaultPluginRegistry.get(id);
        if (!existing) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Plugin '${id}' not found`,
              undefined,
              request.id
            )
          );
        }

        // Built-in plugins cannot be modified
        if (existing.config.id.startsWith('built-in:')) {
          return reply.status(403).send(
            createErrorResponse(
              ErrorCode.FORBIDDEN,
              'Built-in plugins cannot be modified',
              undefined,
              request.id
            )
          );
        }

        // Create updated plugin
        const updatedConfig: RegisterPluginBody = {
          id,
          name: body.name ?? existing.config.name,
          description: body.description ?? existing.config.description,
          level: body.level ?? existing.config.level,
          priority: body.priority ?? existing.config.priority,
          enabled: body.enabled ?? existing.config.enabled,
          continueOnFail: body.continueOnFail ?? existing.config.continueOnFail,
          options: body.options ?? existing.config.options,
          webhookUrl: body.webhookUrl,
          webhookTimeoutMs: body.webhookTimeoutMs,
        };

        // Unregister old and register new
        defaultPluginRegistry.unregister(id);
        const plugin = createWebhookPlugin(updatedConfig);
        defaultPluginRegistry.register(plugin);

        logger.info({ pluginId: id }, 'Plugin updated');

        const response = {
          id: plugin.config.id,
          name: plugin.config.name,
          description: plugin.config.description,
          level: plugin.config.level,
          priority: plugin.config.priority,
          enabled: plugin.config.enabled,
          continueOnFail: plugin.config.continueOnFail,
          options: plugin.config.options,
        };

        return reply.send(createSuccessResponse(response, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to update plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to update plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * DELETE /api/v1/verification/plugins/:id - Unregister a plugin
   */
  app.delete<{ Params: { id: string } }>(
    '/api/v1/verification/plugins/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;

        const existing = defaultPluginRegistry.get(id);
        if (!existing) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Plugin '${id}' not found`,
              undefined,
              request.id
            )
          );
        }

        // Built-in plugins cannot be deleted
        if (existing.config.id.startsWith('built-in:')) {
          return reply.status(403).send(
            createErrorResponse(
              ErrorCode.FORBIDDEN,
              'Built-in plugins cannot be deleted',
              undefined,
              request.id
            )
          );
        }

        defaultPluginRegistry.unregister(id);
        logger.info({ pluginId: id }, 'Plugin unregistered');

        return reply.status(204).send();
      } catch (error) {
        logger.error({ error }, 'Failed to unregister plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to unregister plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * POST /api/v1/verification/plugins/:id/enable - Enable a plugin
   */
  app.post<{ Params: { id: string } }>(
    '/api/v1/verification/plugins/:id/enable',
    async (request, reply) => {
      try {
        const { id } = request.params;

        if (!defaultPluginRegistry.enable(id)) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Plugin '${id}' not found`,
              undefined,
              request.id
            )
          );
        }

        logger.info({ pluginId: id }, 'Plugin enabled');
        return reply.send(createSuccessResponse({ enabled: true }, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to enable plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to enable plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * POST /api/v1/verification/plugins/:id/disable - Disable a plugin
   */
  app.post<{ Params: { id: string } }>(
    '/api/v1/verification/plugins/:id/disable',
    async (request, reply) => {
      try {
        const { id } = request.params;

        if (!defaultPluginRegistry.disable(id)) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Plugin '${id}' not found`,
              undefined,
              request.id
            )
          );
        }

        logger.info({ pluginId: id }, 'Plugin disabled');
        return reply.send(createSuccessResponse({ enabled: false }, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to disable plugin');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to disable plugin',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * POST /api/v1/verification/run - Run verification plugins
   */
  app.post<{ Body: RunPluginsBody }>(
    '/api/v1/verification/run',
    {
      schema: {
        body: {
          type: 'object',
          required: ['workDir'],
          properties: {
            workDir: { type: 'string', minLength: 1 },
            taskPrompt: { type: 'string' },
            modifiedFiles: { type: 'array', items: { type: 'string' } },
            harness: { type: 'string' },
            levels: { type: 'array', items: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'custom'] } },
            timeoutMs: { type: 'number', minimum: 1000, maximum: 600000 },
            pluginIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body;

        const context: VerificationContext = {
          workDir: body.workDir,
          taskPrompt: body.taskPrompt || 'Verification run',
          modifiedFiles: body.modifiedFiles,
          harness: body.harness,
          timeoutMs: body.timeoutMs,
        };

        const result: CombinedVerificationResult = await defaultPluginRunner.run(context, {
          levels: body.levels,
          pluginIds: body.pluginIds,
        });

        return reply.send(createSuccessResponse(result, request.id));
      } catch (error) {
        logger.error({ error }, 'Failed to run verification');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to run verification',
            undefined,
            request.id
          )
        );
      }
    }
  );
}
