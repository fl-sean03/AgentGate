/**
 * OpenAPI Schemas for Audit Routes
 *
 * Defines Fastify route schemas with OpenAPI annotations for audit endpoints.
 * v0.2.17 - Thrust 5
 *
 * @module server/routes/schemas/audit
 */

import type { FastifySchema } from 'fastify';

/**
 * GET /api/v1/audit/runs/:runId - Get audit record summary for a run
 */
export const getAuditRecordSchema: FastifySchema = {
  tags: ['Audit'],
  summary: 'Get audit record for a run',
  description: 'Get the configuration audit record summary for a specific run, including initial and final config snapshots.',
  params: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        description: 'Run ID',
      },
    },
    required: ['runId'],
  },
  response: {
    200: {
      description: 'Successful response',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: { $ref: '#/components/schemas/AuditRecord' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Audit record not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * GET /api/v1/audit/runs/:runId/snapshots - Get config snapshots for a run
 */
export const getAuditSnapshotsSchema: FastifySchema = {
  tags: ['Audit'],
  summary: 'Get config snapshots for a run',
  description: 'Get all configuration snapshots recorded during a run execution.',
  params: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        description: 'Run ID',
      },
    },
    required: ['runId'],
  },
  querystring: {
    type: 'object',
    properties: {
      iteration: {
        type: 'integer',
        minimum: 0,
        description: 'Filter by specific iteration number',
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
              items: { $ref: '#/components/schemas/ConfigSnapshot' },
            },
            total: { type: 'integer' },
          },
        },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Audit record not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * GET /api/v1/audit/runs/:runId/changes - Get config changes for a run
 */
export const getAuditChangesSchema: FastifySchema = {
  tags: ['Audit'],
  summary: 'Get config changes for a run',
  description: 'Get all configuration changes that occurred during a run execution.',
  params: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        description: 'Run ID',
      },
    },
    required: ['runId'],
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
              items: { $ref: '#/components/schemas/ConfigChange' },
            },
            total: { type: 'integer' },
            summary: {
              type: 'object',
              properties: {
                totalChanges: { type: 'integer' },
                changedPaths: {
                  type: 'array',
                  items: { type: 'string' },
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
      description: 'Audit record not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};
