/**
 * OpenAPI Schemas for Runs Routes
 *
 * Defines Fastify route schemas with OpenAPI annotations for run endpoints.
 * v0.2.17 - Thrust 5
 *
 * @module server/routes/schemas/runs
 */

import type { FastifySchema } from 'fastify';

/**
 * GET /api/v1/runs - List runs
 */
export const listRunsSchema: FastifySchema = {
  tags: ['Runs'],
  summary: 'List runs',
  description: 'Get a paginated list of runs with optional filtering by work order ID or status.',
  querystring: {
    type: 'object',
    properties: {
      workOrderId: {
        type: 'string',
        description: 'Filter by work order ID',
      },
      status: {
        type: 'string',
        enum: ['queued', 'building', 'running', 'succeeded', 'failed', 'canceled'],
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
              items: { $ref: '#/components/schemas/RunSummary' },
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
 * GET /api/v1/runs/:id - Get run details
 */
export const getRunSchema: FastifySchema = {
  tags: ['Runs'],
  summary: 'Get run details',
  description: 'Get detailed information about a specific run, including iteration history and verification results.',
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Run ID',
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
        data: { $ref: '#/components/schemas/RunDetail' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Run not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};
