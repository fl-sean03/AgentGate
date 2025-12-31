import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import { apiKeyAuth } from '../middleware/auth.js';
import {
  listWorkOrdersQuerySchema,
  workOrderIdParamsSchema,
  createWorkOrderBodySchema,
  type ListWorkOrdersQuery,
  type WorkOrderIdParams,
  type CreateWorkOrderBody,
  type WorkOrderSummary,
  type WorkOrderDetail,
  type PaginatedResponse,
  type RunSummary,
} from '../types/api.js';
import { workOrderService } from '../../control-plane/work-order-service.js';
import { listRuns } from '../../orchestrator/run-store.js';
import { WorkOrderStatus, type WorkOrder, type Run, RunState, type SubmitRequest } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:work-orders');

/**
 * Convert internal workspace source to API format
 */
function toApiWorkspaceSource(source: WorkOrder['workspaceSource']): WorkOrderSummary['workspaceSource'] {
  switch (source.type) {
    case 'local':
      return { type: 'local', path: source.path };
    case 'github':
      return { type: 'github', repo: `${source.owner}/${source.repo}`, branch: source.branch };
    case 'github-new':
      return { type: 'github-new', repo: `${source.owner}/${source.repoName}`, template: source.template };
    case 'git':
      // Map legacy git source to github format
      return { type: 'github', repo: source.url, branch: source.branch };
    case 'fresh':
      // Map legacy fresh source to local format
      return { type: 'local', path: source.destPath };
    default:
      return { type: 'local', path: '' };
  }
}

/**
 * Convert a WorkOrder to WorkOrderSummary for API response
 */
function toWorkOrderSummary(order: WorkOrder, runCount: number): WorkOrderSummary {
  return {
    id: order.id,
    taskPrompt: order.taskPrompt,
    status: order.status,
    workspaceSource: toApiWorkspaceSource(order.workspaceSource),
    agentType: order.agentType,
    createdAt: order.createdAt.toISOString(),
    updatedAt: (order.completedAt ?? order.createdAt).toISOString(),
    runCount,
  };
}

/**
 * Convert a Run to RunSummary for API response
 */
function toRunSummary(run: Run): RunSummary {
  // Map RunState to the API status type
  const statusMap: Record<RunState, RunSummary['status']> = {
    [RunState.QUEUED]: 'queued',
    [RunState.LEASED]: 'building',
    [RunState.BUILDING]: 'building',
    [RunState.SNAPSHOTTING]: 'running',
    [RunState.VERIFYING]: 'running',
    [RunState.FEEDBACK]: 'running',
    [RunState.PR_CREATED]: 'running',
    [RunState.CI_POLLING]: 'running',
    [RunState.SUCCEEDED]: 'succeeded',
    [RunState.FAILED]: 'failed',
    [RunState.CANCELED]: 'canceled',
  };

  const summary: RunSummary = {
    id: run.id,
    status: statusMap[run.state],
    startedAt: run.startedAt.toISOString(),
    iterationCount: run.iteration,
  };

  if (run.completedAt) {
    summary.completedAt = run.completedAt.toISOString();
  }

  return summary;
}

/**
 * Get run count for a work order
 */
async function getRunCountForWorkOrder(workOrderId: string): Promise<number> {
  const runs = await listRuns({ limit: 100 });
  return runs.filter((r) => r.workOrderId === workOrderId).length;
}

/**
 * Get runs for a work order
 */
async function getRunsForWorkOrder(workOrderId: string): Promise<Run[]> {
  const runs = await listRuns({ limit: 100 });
  return runs.filter((r) => r.workOrderId === workOrderId);
}

/**
 * Register work order API routes
 */
export function registerWorkOrderRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/work-orders - List work orders
   */
  app.get<{
    Querystring: ListWorkOrdersQuery;
  }>('/api/v1/work-orders', async (request, reply) => {
    try {
      // Parse and validate query parameters
      const queryResult = listWorkOrdersQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid query parameters',
            { errors: queryResult.error.errors },
            request.id
          )
        );
      }

      const { status, limit, offset } = queryResult.data;

      // Get work orders from service
      const orders = await workOrderService.list({
        status: status as WorkOrderStatus | undefined,
        limit,
        offset,
      });

      // Convert to summaries with run counts
      const items: WorkOrderSummary[] = await Promise.all(
        orders.map(async (order) => {
          const runCount = await getRunCountForWorkOrder(order.id);
          return toWorkOrderSummary(order, runCount);
        })
      );

      // Get total count for pagination
      const counts = await workOrderService.getCounts();
      const total = status
        ? counts[status as WorkOrderStatus] ?? 0
        : Object.values(counts).reduce((a, b) => a + b, 0);

      const response: PaginatedResponse<WorkOrderSummary> = {
        items,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to list work orders');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to list work orders',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/work-orders/:id - Get work order details
   */
  app.get<{
    Params: WorkOrderIdParams;
  }>('/api/v1/work-orders/:id', async (request, reply) => {
    try {
      // Validate params
      const paramsResult = workOrderIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid work order ID',
            { errors: paramsResult.error.errors },
            request.id
          )
        );
      }

      const { id } = paramsResult.data;

      // Get work order
      const order = await workOrderService.get(id);
      if (!order) {
        return reply.status(404).send(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Work order not found: ${id}`,
            undefined,
            request.id
          )
        );
      }

      // Get runs for this work order
      const runs = await getRunsForWorkOrder(id);
      const runSummaries = runs.map(toRunSummary);

      const detail: WorkOrderDetail = {
        ...toWorkOrderSummary(order, runs.length),
        maxIterations: order.maxIterations,
        maxTime: order.maxWallClockSeconds,
        runs: runSummaries,
      };

      return reply.send(createSuccessResponse(detail, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get work order');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get work order',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * POST /api/v1/work-orders - Submit a new work order
   * Requires authentication
   */
  app.post<{
    Body: CreateWorkOrderBody;
  }>(
    '/api/v1/work-orders',
    {
      preHandler: [apiKeyAuth],
    },
    async (request, reply) => {
      try {
        // Validate body
        const bodyResult = createWorkOrderBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid request body',
              { errors: bodyResult.error.errors },
              request.id
            )
          );
        }

        const body = bodyResult.data;

        // Map API workspace source to internal format
        const workspaceSource = mapWorkspaceSource(body.workspaceSource);

        // Submit work order - service applies defaults for optional fields
        const submitRequest: SubmitRequest = {
          taskPrompt: body.taskPrompt,
          workspaceSource,
          agentType: mapAgentType(body.agentType),
          maxIterations: body.maxIterations,
          maxWallClockSeconds: body.maxTime ?? 3600,
          gatePlanSource: 'auto',
          waitForCI: false,
        };
        const order = await workOrderService.submit(submitRequest);

        const summary = toWorkOrderSummary(order, 0);

        return reply.status(201).send(createSuccessResponse(summary, request.id));
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to create work order');
        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to create work order',
            undefined,
            request.id
          )
        );
      }
    }
  );

  /**
   * DELETE /api/v1/work-orders/:id - Cancel a work order
   * Requires authentication
   * Returns 409 if work order is already completed
   */
  app.delete<{
    Params: WorkOrderIdParams;
  }>(
    '/api/v1/work-orders/:id',
    {
      preHandler: [apiKeyAuth],
    },
    async (request, reply) => {
      try {
        // Validate params
        const paramsResult = workOrderIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid work order ID',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { id } = paramsResult.data;

        // Get work order to check status
        const order = await workOrderService.get(id);
        if (!order) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Work order not found: ${id}`,
              undefined,
              request.id
            )
          );
        }

        // Check if already completed (succeeded, failed, or canceled)
        const completedStatuses: WorkOrderStatus[] = [
          WorkOrderStatus.SUCCEEDED,
          WorkOrderStatus.FAILED,
          WorkOrderStatus.CANCELED,
        ];

        if (completedStatuses.includes(order.status)) {
          return reply.status(409).send(
            createErrorResponse(
              ErrorCode.CONFLICT,
              `Cannot cancel work order in status '${order.status}'`,
              undefined,
              request.id
            )
          );
        }

        // Cancel the work order
        await workOrderService.cancel(id);

        return reply.send(
          createSuccessResponse(
            { id, status: 'canceled', message: 'Work order canceled successfully' },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to cancel work order');

        // Handle specific error from service
        if (error instanceof Error && error.message.includes('Cannot cancel')) {
          return reply.status(409).send(
            createErrorResponse(
              ErrorCode.CONFLICT,
              error.message,
              undefined,
              request.id
            )
          );
        }

        return reply.status(500).send(
          createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Failed to cancel work order',
            undefined,
            request.id
          )
        );
      }
    }
  );
}

/**
 * Map API workspace source to internal format
 * Uses exhaustive switch for type safety (v0.2.10 - Thrust 14)
 *
 * For GitHub sources, the repo field can be:
 * - "owner/repo" format (explicit owner)
 * - "repo" only (uses AGENTGATE_GITHUB_OWNER env var as default)
 */
function mapWorkspaceSource(source: CreateWorkOrderBody['workspaceSource']): WorkOrder['workspaceSource'] {
  const defaultOwner = process.env.AGENTGATE_GITHUB_OWNER ?? '';

  switch (source.type) {
    case 'local':
      return { type: 'local', path: source.path };
    case 'github': {
      const parts = source.repo.split('/');
      const hasExplicitOwner = parts.length === 2 && parts[0] && parts[1];
      return {
        type: 'github',
        owner: hasExplicitOwner ? (parts[0] as string) : defaultOwner,
        repo: hasExplicitOwner ? (parts[1] as string) : source.repo,
        branch: source.branch,
      };
    }
    case 'github-new': {
      const parts = source.repo.split('/');
      const hasExplicitOwner = parts.length === 2 && parts[0] && parts[1];
      return {
        type: 'github-new',
        owner: hasExplicitOwner ? (parts[0] as string) : defaultOwner,
        repoName: hasExplicitOwner ? (parts[1] as string) : source.repo,
        template: source.template as 'minimal' | 'typescript' | 'python' | undefined,
      };
    }
    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = source;
      throw new Error(`Unknown workspace source type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/**
 * Map API agent type to internal format
 * Rejects unknown agent types (v0.2.10 - Thrust 14)
 */
function mapAgentType(apiType: CreateWorkOrderBody['agentType']): WorkOrder['agentType'] {
  const validTypes: Record<string, WorkOrder['agentType']> = {
    'claude-code-subscription': 'claude-code-subscription',
  };

  const mapped = validTypes[apiType];
  if (!mapped) {
    throw new Error(`Unknown agent type: ${apiType}`);
  }
  return mapped;
}
