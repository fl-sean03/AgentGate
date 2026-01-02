/**
 * OpenAPI/Swagger Configuration
 *
 * Configures OpenAPI 3.0.3 documentation and Swagger UI for the AgentGate API.
 * v0.2.17 - Thrust 5
 *
 * @module server/openapi
 */

import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import type { OpenAPIV3 } from 'openapi-types';

/**
 * OpenAPI component schemas for reuse across endpoints
 * Typed for OpenAPI 3.0 compatibility
 */
export const componentSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  // Common error response schema
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Error code' },
          message: { type: 'string', description: 'Human-readable error message' },
          details: { type: 'object', description: 'Additional error details', additionalProperties: true },
        },
        required: ['code', 'message'],
      },
      requestId: { type: 'string', description: 'Unique request identifier' },
    },
    required: ['success', 'error', 'requestId'],
  },

  // Paginated response wrapper
  PaginatedResponse: {
    type: 'object',
    properties: {
      items: { type: 'array', items: {} },
      total: { type: 'integer', description: 'Total number of items' },
      limit: { type: 'integer', description: 'Number of items per page' },
      offset: { type: 'integer', description: 'Number of items skipped' },
      hasMore: { type: 'boolean', description: 'Whether more items are available' },
    },
    required: ['items', 'total', 'limit', 'offset', 'hasMore'],
  },

  // Workspace source schemas
  LocalWorkspaceSource: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['local'] },
      path: { type: 'string', description: 'Local filesystem path' },
    },
    required: ['type', 'path'],
  },

  GitHubWorkspaceSource: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['github'] },
      repo: { type: 'string', description: 'Repository in owner/repo format' },
      branch: { type: 'string', description: 'Branch name' },
    },
    required: ['type', 'repo'],
  },

  GitHubNewWorkspaceSource: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['github-new'] },
      repo: { type: 'string', description: 'New repository name in owner/repo format' },
      template: { type: 'string', description: 'Template to use (minimal, typescript, python)' },
    },
    required: ['type', 'repo'],
  },

  WorkspaceSource: {
    oneOf: [
      { $ref: '#/components/schemas/LocalWorkspaceSource' },
      { $ref: '#/components/schemas/GitHubWorkspaceSource' },
      { $ref: '#/components/schemas/GitHubNewWorkspaceSource' },
    ],
  },

  // Loop strategy configuration
  LoopStrategyConfig: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['fixed', 'hybrid', 'ralph', 'custom'],
        description: 'Loop strategy mode',
      },
      maxIterations: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum iterations' },
      baseIterations: { type: 'integer', minimum: 1, maximum: 100, description: 'Base iterations for hybrid mode' },
      maxBonusIterations: { type: 'integer', minimum: 0, maximum: 100, description: 'Max bonus iterations for hybrid mode' },
      progressThreshold: { type: 'number', minimum: 0, maximum: 1, description: 'Progress threshold' },
      completionCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Completion criteria indicators',
      },
      minIterations: { type: 'integer', minimum: 1, maximum: 100, description: 'Minimum iterations for ralph mode' },
      convergenceThreshold: { type: 'number', minimum: 0, maximum: 1, description: 'Convergence threshold for ralph mode' },
      windowSize: { type: 'integer', minimum: 2, maximum: 10, description: 'Window size for ralph mode' },
    },
  },

  // Verification configuration
  VerificationConfig: {
    type: 'object',
    properties: {
      gatePlanSource: { type: 'string', enum: ['auto', 'inline', 'workspace', 'ci-workflow'] },
      waitForCI: { type: 'boolean', description: 'Wait for CI completion' },
      skipLevels: {
        type: 'array',
        items: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'lint', 'typecheck', 'test', 'blackbox', 'contracts'] },
        description: 'Verification levels to skip',
      },
    },
  },

  // GitOps configuration
  GitOpsConfig: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['direct', 'branch', 'pr', 'fork'] },
      branchPattern: { type: 'string', description: 'Branch naming pattern' },
      draftPR: { type: 'boolean', description: 'Create PR as draft' },
      autoMerge: { type: 'boolean', description: 'Auto-merge PR when checks pass' },
    },
  },

  // Execution limits
  ExecutionLimitsConfig: {
    type: 'object',
    properties: {
      maxWallClockSeconds: { type: 'integer', minimum: 60, maximum: 86400 },
      networkAllowed: { type: 'boolean' },
      maxDiskMb: { type: 'integer', minimum: 1 },
    },
  },

  // Harness options for API request
  HarnessOptions: {
    type: 'object',
    properties: {
      profile: { type: 'string', description: 'Named profile to use' },
      loopStrategy: { $ref: '#/components/schemas/LoopStrategyConfig' },
      verification: { $ref: '#/components/schemas/VerificationConfig' },
      gitOps: { $ref: '#/components/schemas/GitOpsConfig' },
      limits: { $ref: '#/components/schemas/ExecutionLimitsConfig' },
    },
  },

  // Harness info in response
  HarnessInfo: {
    type: 'object',
    properties: {
      profile: { type: 'string', nullable: true },
      loopStrategy: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
          maxIterations: { type: 'integer' },
        },
      },
      verification: {
        type: 'object',
        properties: {
          waitForCI: { type: 'boolean' },
          skipLevels: { type: 'array', items: { type: 'string' } },
        },
      },
      gitOps: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
        },
      },
    },
  },

  // Work order summary
  WorkOrderSummary: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Work order ID' },
      taskPrompt: { type: 'string', description: 'Task description' },
      status: {
        type: 'string',
        enum: ['queued', 'running', 'waiting_for_children', 'integrating', 'succeeded', 'failed', 'canceled'],
        description: 'Current status',
      },
      workspaceSource: { $ref: '#/components/schemas/WorkspaceSource' },
      agentType: { type: 'string', description: 'Type of agent' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      runCount: { type: 'integer', description: 'Number of runs' },
    },
    required: ['id', 'taskPrompt', 'status', 'workspaceSource', 'agentType', 'createdAt', 'runCount'],
  },

  // Work order detail
  WorkOrderDetail: {
    allOf: [
      { $ref: '#/components/schemas/WorkOrderSummary' },
      {
        type: 'object',
        properties: {
          maxIterations: { type: 'integer' },
          maxTime: { type: 'integer', nullable: true },
          runs: { type: 'array', items: { $ref: '#/components/schemas/RunSummary' } },
          harness: { $ref: '#/components/schemas/HarnessInfo' },
        },
      },
    ],
  },

  // Run summary
  RunSummary: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Run ID' },
      status: {
        type: 'string',
        enum: ['queued', 'building', 'running', 'succeeded', 'failed', 'canceled'],
        description: 'Current status',
      },
      startedAt: { type: 'string', format: 'date-time' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
      iterationCount: { type: 'integer', description: 'Number of iterations' },
    },
    required: ['id', 'status', 'iterationCount'],
  },

  // Run detail
  RunDetail: {
    allOf: [
      { $ref: '#/components/schemas/RunSummary' },
      {
        type: 'object',
        properties: {
          workOrderId: { type: 'string' },
          branchName: { type: 'string', nullable: true },
          prUrl: { type: 'string', nullable: true },
          iterations: { type: 'array', items: { $ref: '#/components/schemas/IterationSummary' } },
        },
        required: ['workOrderId', 'iterations'],
      },
    ],
  },

  // Iteration summary
  IterationSummary: {
    type: 'object',
    properties: {
      number: { type: 'integer' },
      status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
      startedAt: { type: 'string', format: 'date-time' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
      verification: { $ref: '#/components/schemas/VerificationSummary' },
    },
    required: ['number', 'status'],
  },

  // Verification summary
  VerificationSummary: {
    type: 'object',
    properties: {
      l0Passed: { type: 'boolean' },
      l1Passed: { type: 'boolean' },
      l2Passed: { type: 'boolean', nullable: true },
      l3Passed: { type: 'boolean', nullable: true },
      overallPassed: { type: 'boolean' },
    },
    required: ['l0Passed', 'l1Passed', 'overallPassed'],
  },

  // Profile summary
  ProfileSummary: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      extends: { type: 'string', nullable: true },
      isBuiltIn: { type: 'boolean' },
    },
    required: ['name', 'isBuiltIn'],
  },

  // Profile detail
  ProfileDetail: {
    allOf: [
      { $ref: '#/components/schemas/ProfileSummary' },
      {
        type: 'object',
        properties: {
          loopStrategy: { $ref: '#/components/schemas/LoopStrategyConfig' },
          verification: { $ref: '#/components/schemas/VerificationConfig' },
          gitOps: { $ref: '#/components/schemas/GitOpsConfig' },
          executionLimits: { $ref: '#/components/schemas/ExecutionLimitsConfig' },
          resolved: {
            type: 'object',
            properties: {
              inheritanceChain: { type: 'array', items: { type: 'string' } },
              configHash: { type: 'string' },
            },
          },
        },
      },
    ],
  },

  // Config snapshot for audit
  ConfigSnapshot: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      workOrderId: { type: 'string' },
      runId: { type: 'string' },
      iteration: { type: 'integer' },
      snapshotAt: { type: 'string', format: 'date-time' },
      configHash: { type: 'string' },
      config: {
        type: 'object',
        properties: {
          loopStrategy: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              maxIterations: { type: 'integer' },
            },
          },
          verification: {
            type: 'object',
            properties: {
              skipLevels: { type: 'array', items: { type: 'string' } },
            },
          },
          gitOps: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
            },
          },
          executionLimits: {
            type: 'object',
            properties: {
              maxWallClockSeconds: { type: 'integer' },
            },
          },
        },
      },
    },
    required: ['id', 'runId', 'iteration', 'snapshotAt', 'configHash', 'config'],
  },

  // Audit record
  AuditRecord: {
    type: 'object',
    properties: {
      runId: { type: 'string' },
      workOrderId: { type: 'string' },
      startedAt: { type: 'string', format: 'date-time' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
      initialConfig: { $ref: '#/components/schemas/ConfigSnapshot' },
      finalConfig: { $ref: '#/components/schemas/ConfigSnapshot', nullable: true },
      snapshotCount: { type: 'integer' },
      changeCount: { type: 'integer' },
      configHashChanged: { type: 'boolean' },
    },
    required: ['runId', 'workOrderId', 'startedAt', 'initialConfig', 'snapshotCount', 'changeCount', 'configHashChanged'],
  },

  // Config change
  ConfigChange: {
    type: 'object',
    properties: {
      iteration: { type: 'integer' },
      path: { type: 'string', description: 'Dot-notation path to changed field' },
      previousValue: { description: 'Previous value' },
      newValue: { description: 'New value' },
      changedAt: { type: 'string', format: 'date-time' },
    },
    required: ['iteration', 'path', 'changedAt'],
  },

  // Stream event
  StreamEvent: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['connected', 'iteration-start', 'verification-complete', 'iteration-complete', 'run-complete', 'heartbeat', 'error'],
      },
      runId: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      data: { type: 'object', additionalProperties: true },
    },
    required: ['type', 'runId', 'timestamp'],
  },
};

/**
 * Register OpenAPI/Swagger plugins
 */
export async function registerOpenAPI(app: FastifyInstance): Promise<void> {
  // Register Swagger/OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AgentGate API',
        description: `
AgentGate API provides programmatic access to autonomous code agent orchestration.

## Authentication

Mutating endpoints require an API key passed in the \`X-API-Key\` header.

## Streaming

Real-time updates are available via Server-Sent Events (SSE) at:
- \`GET /api/v1/runs/:id/stream\`

## Rate Limiting

API calls may be rate limited. Check response headers for limit information.

## Common Response Format

All endpoints return responses in the following format:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "requestId": "..."
}
\`\`\`

Error responses follow this format:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  },
  "requestId": "..."
}
\`\`\`
        `,
        version: '0.2.17',
        contact: {
          name: 'AgentGate Team',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development',
        },
        {
          url: 'https://api.agentgate.dev',
          description: 'Production',
        },
      ],
      tags: [
        {
          name: 'Work Orders',
          description: 'Work order submission and management',
        },
        {
          name: 'Runs',
          description: 'Run execution and monitoring',
        },
        {
          name: 'Profiles',
          description: 'Harness profile management',
        },
        {
          name: 'Audit',
          description: 'Configuration audit trail',
        },
        {
          name: 'Streaming',
          description: 'Real-time event streaming via SSE',
        },
        {
          name: 'Health',
          description: 'Health check endpoints',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
            description: 'API key for authentication',
          },
        },
        schemas: componentSchemas,
      },
    },
  });

  // Register Swagger UI
  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
    },
    staticCSP: true,
  });
}

/**
 * Generate OpenAPI spec as JSON string
 */
export async function generateOpenAPISpec(app: FastifyInstance): Promise<string> {
  await app.ready();
  return JSON.stringify(app.swagger(), null, 2);
}

/**
 * Generate OpenAPI spec as object
 */
export async function getOpenAPISpec(app: FastifyInstance): Promise<Record<string, unknown>> {
  await app.ready();
  return app.swagger() as Record<string, unknown>;
}
