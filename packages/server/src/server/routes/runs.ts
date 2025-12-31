import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import {
  listRunsQuerySchema,
  runIdParamsSchema,
  type ListRunsQuery,
  type RunIdParams,
  type RunDetail,
  type RunSummary,
  type PaginatedResponse,
  type IterationSummary,
} from '../types/api.js';
import { listRuns, loadRun, getAllIterationData } from '../../orchestrator/run-store.js';
import { type Run, type IterationData, RunState } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:runs');

/**
 * Map RunState to API status
 */
function mapRunStatus(state: RunState): RunSummary['status'] {
  const statusMap: Record<RunState, RunSummary['status']> = {
    [RunState.QUEUED]: 'queued',
    [RunState.LEASED]: 'building',
    [RunState.BUILDING]: 'building',
    [RunState.SNAPSHOTTING]: 'running',
    [RunState.VERIFYING]: 'running',
    [RunState.FEEDBACK]: 'running',
    [RunState.SUCCEEDED]: 'succeeded',
    [RunState.FAILED]: 'failed',
    [RunState.CANCELED]: 'canceled',
  };
  return statusMap[state];
}

/**
 * Convert a Run to RunSummary for API response
 */
function toRunSummary(run: Run): RunSummary {
  const summary: RunSummary = {
    id: run.id,
    status: mapRunStatus(run.state),
    startedAt: run.startedAt.toISOString(),
    iterationCount: run.iteration,
  };

  if (run.completedAt) {
    summary.completedAt = run.completedAt.toISOString();
  }

  return summary;
}

/**
 * Convert IterationData to IterationSummary for API response
 */
function toIterationSummary(data: IterationData): IterationSummary {
  // Map RunState to iteration status
  const statusMap: Record<RunState, IterationSummary['status']> = {
    [RunState.QUEUED]: 'pending',
    [RunState.LEASED]: 'running',
    [RunState.BUILDING]: 'running',
    [RunState.SNAPSHOTTING]: 'running',
    [RunState.VERIFYING]: 'running',
    [RunState.FEEDBACK]: 'running',
    [RunState.SUCCEEDED]: 'completed',
    [RunState.FAILED]: 'failed',
    [RunState.CANCELED]: 'failed',
  };

  const summary: IterationSummary = {
    number: data.iteration,
    status: statusMap[data.state],
    startedAt: data.startedAt.toISOString(),
  };

  if (data.completedAt) {
    summary.completedAt = data.completedAt.toISOString();
  }

  // Add verification summary if available
  if (data.verificationPassed !== null) {
    summary.verification = {
      l0Passed: data.verificationPassed,
      l1Passed: data.verificationPassed,
      overallPassed: data.verificationPassed,
    };
  }

  return summary;
}

/**
 * Convert a Run to RunDetail for API response
 */
async function toRunDetail(run: Run): Promise<RunDetail> {
  const iterations = await getAllIterationData(run.id);

  const detail: RunDetail = {
    ...toRunSummary(run),
    workOrderId: run.workOrderId,
    iterations: iterations.map(toIterationSummary),
  };

  if (run.gitHubBranch) {
    detail.branchName = run.gitHubBranch;
  }

  if (run.gitHubPrUrl) {
    detail.prUrl = run.gitHubPrUrl;
  }

  return detail;
}

/**
 * Register run API routes
 */
export function registerRunRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/runs - List runs
   */
  app.get<{
    Querystring: ListRunsQuery;
  }>('/api/v1/runs', async (request, reply) => {
    try {
      // Parse and validate query parameters
      const queryResult = listRunsQuerySchema.safeParse(request.query);
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

      const { workOrderId, status, limit, offset } = queryResult.data;

      // Get all runs
      let runs = await listRuns({ limit: 100 });

      // Apply filters
      if (workOrderId) {
        runs = runs.filter((r) => r.workOrderId === workOrderId);
      }

      if (status) {
        runs = runs.filter((r) => mapRunStatus(r.state) === status);
      }

      // Get total before pagination
      const total = runs.length;

      // Apply pagination
      runs = runs.slice(offset, offset + limit);

      // Convert to summaries
      const items: RunSummary[] = runs.map(toRunSummary);

      const response: PaginatedResponse<RunSummary> = {
        items,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to list runs');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to list runs',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/runs/:id - Get run details
   */
  app.get<{
    Params: RunIdParams;
  }>('/api/v1/runs/:id', async (request, reply) => {
    try {
      // Validate params
      const paramsResult = runIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid run ID',
            { errors: paramsResult.error.errors },
            request.id
          )
        );
      }

      const { id } = paramsResult.data;

      // Get run
      const run = await loadRun(id);
      if (!run) {
        return reply.status(404).send(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Run not found: ${id}`,
            undefined,
            request.id
          )
        );
      }

      const detail = await toRunDetail(run);

      return reply.send(createSuccessResponse(detail, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get run');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get run',
          undefined,
          request.id
        )
      );
    }
  });
}
