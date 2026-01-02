/**
 * OpenAPI Schemas for Work Orders Routes
 *
 * Defines Fastify route schemas with OpenAPI annotations for work order endpoints.
 * v0.2.17 - Thrust 5
 *
 * @module server/routes/schemas/work-orders
 */

import type { FastifySchema } from 'fastify';

/**
 * GET /api/v1/work-orders - List work orders
 */
export const listWorkOrdersSchema: FastifySchema = {
  tags: ['Work Orders'],
  summary: 'List work orders',
  description: 'Get a paginated list of work orders with optional filtering by status.',
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['queued', 'running', 'waiting_for_children', 'integrating', 'succeeded', 'failed', 'canceled'],
        description: 'Filter by status',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Number of items to return',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Number of items to skip',
      },
    },
  },
  response: {
    200: {
      description: 'Successful response',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/WorkOrderSummary' },
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * GET /api/v1/work-orders/:id - Get work order details
 */
export const getWorkOrderSchema: FastifySchema = {
  tags: ['Work Orders'],
  summary: 'Get work order details',
  description: 'Get detailed information about a specific work order, including associated runs and harness configuration.',
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Work order ID',
      },
    },
    required: ['id'],
  },
  response: {
    200: {
      description: 'Successful response',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: { $ref: '#/components/schemas/WorkOrderDetail' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Work order not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * POST /api/v1/work-orders - Create a new work order
 */
export const createWorkOrderSchema: FastifySchema = {
  tags: ['Work Orders'],
  summary: 'Submit a new work order',
  description: `
Submit a new work order for execution by an autonomous code agent.

The work order specifies:
- **taskPrompt**: The task description for the agent
- **workspaceSource**: Where to find or create the code
- **agentType**: Which agent type to use (currently only 'claude-code-subscription')
- **harness**: Optional harness configuration overrides

The work order will be queued and executed when resources are available.
  `,
  security: [{ apiKey: [] }],
  body: {
    type: 'object',
    required: ['taskPrompt', 'workspaceSource'],
    properties: {
      taskPrompt: {
        type: 'string',
        minLength: 10,
        description: 'Task description for the agent (minimum 10 characters)',
      },
      workspaceSource: { $ref: '#/components/schemas/WorkspaceSource' },
      agentType: {
        type: 'string',
        enum: ['claude-code-subscription', 'openai-codex', 'opencode'],
        default: 'claude-code-subscription',
        description: 'Agent type to use',
      },
      maxIterations: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 3,
        description: 'Maximum number of iterations (legacy, prefer harness.loopStrategy.maxIterations)',
      },
      maxTime: {
        type: 'integer',
        minimum: 60,
        maximum: 86400,
        description: 'Maximum execution time in seconds (legacy, prefer harness.limits.maxWallClockSeconds)',
      },
      harness: { $ref: '#/components/schemas/HarnessOptions' },
    },
  },
  response: {
    201: {
      description: 'Work order created successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: { $ref: '#/components/schemas/WorkOrderSummary' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    401: {
      description: 'API key required',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * DELETE /api/v1/work-orders/:id - Cancel a work order
 */
export const cancelWorkOrderSchema: FastifySchema = {
  tags: ['Work Orders'],
  summary: 'Cancel a work order',
  description: 'Cancel a queued or running work order. Returns 409 if the work order is already completed.',
  security: [{ apiKey: [] }],
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Work order ID',
      },
    },
    required: ['id'],
  },
  response: {
    200: {
      description: 'Work order canceled successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['canceled'] },
            message: { type: 'string' },
          },
        },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    401: {
      description: 'API key required',
      $ref: '#/components/schemas/Error',
    },
    404: {
      description: 'Work order not found',
      $ref: '#/components/schemas/Error',
    },
    409: {
      description: 'Cannot cancel completed work order',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * GET /api/v1/work-orders/:id/audit - Get audit records for a work order
 */
export const getWorkOrderAuditSchema: FastifySchema = {
  tags: ['Work Orders', 'Audit'],
  summary: 'Get audit records for a work order',
  description: 'Get audit trail summary for all runs associated with a work order.',
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Work order ID',
      },
    },
    required: ['id'],
  },
  response: {
    200: {
      description: 'Successful response',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            workOrderId: { type: 'string' },
            runs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  runId: { type: 'string' },
                  iteration: { type: 'integer' },
                  startedAt: { type: 'string', format: 'date-time' },
                  configHash: { type: 'string' },
                  changesCount: { type: 'integer' },
                },
              },
            },
          },
        },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Work order not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};
