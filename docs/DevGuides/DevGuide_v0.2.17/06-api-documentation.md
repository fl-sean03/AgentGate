# 06: API Documentation

This document covers Thrust 5: implementing OpenAPI/Swagger documentation for the AgentGate API.

---

## Thrust 5: API Documentation

### 5.1 Objective

Generate comprehensive OpenAPI 3.0 documentation for all API endpoints, enabling API exploration via Swagger UI and client code generation.

### 5.2 Background

OpenAPI (formerly Swagger) is the standard for API documentation. Fastify has excellent OpenAPI support via `@fastify/swagger` and `@fastify/swagger-ui` plugins. This thrust adds auto-generated API docs based on our Zod schemas.

### 5.3 Subtasks

#### 5.3.1 Add OpenAPI Dependencies

Update `packages/server/package.json`:

```json
{
  "dependencies": {
    "@fastify/swagger": "^8.x",
    "@fastify/swagger-ui": "^4.x"
  }
}
```

Run `pnpm install`.

#### 5.3.2 Create OpenAPI Configuration

Create `packages/server/src/server/openapi.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

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
- \`GET /api/v1/work-orders/:id/stream\`

## Rate Limiting

API calls may be rate limited. Check response headers for limit information.
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
          description: 'Real-time event streaming',
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
        schemas: {
          // Common schemas defined here
          Error: {
            type: 'object',
            properties: {
              success: { type: 'boolean', enum: [false] },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['code', 'message'],
              },
              requestId: { type: 'string' },
            },
            required: ['success', 'error', 'requestId'],
          },
          PaginatedResponse: {
            type: 'object',
            properties: {
              items: { type: 'array' },
              total: { type: 'integer' },
              limit: { type: 'integer' },
              offset: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          },
        },
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

// Export OpenAPI spec generation
export async function generateOpenAPISpec(app: FastifyInstance): Promise<string> {
  await app.ready();
  return JSON.stringify(app.swagger(), null, 2);
}
```

#### 5.3.3 Add Route Schemas

Update each route file to include OpenAPI schemas. Example for work orders:

```typescript
// In packages/server/src/server/routes/work-orders.ts

const listWorkOrdersSchema = {
  tags: ['Work Orders'],
  summary: 'List work orders',
  description: 'Get a paginated list of work orders with optional filtering',
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'],
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

app.get('/api/v1/work-orders', {
  schema: listWorkOrdersSchema,
  handler: async (request, reply) => { ... },
});
```

#### 5.3.4 Define Component Schemas

Add reusable schemas for all API types:

```typescript
// Add to openapi.ts components.schemas

const componentSchemas = {
  // Work Order schemas
  WorkOrderSummary: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Work order ID' },
      taskPrompt: { type: 'string', description: 'Task description' },
      status: {
        type: 'string',
        enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'],
      },
      workspaceSource: { $ref: '#/components/schemas/WorkspaceSource' },
      agentType: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      runCount: { type: 'integer' },
    },
    required: ['id', 'taskPrompt', 'status', 'workspaceSource', 'agentType', 'createdAt'],
  },

  WorkspaceSource: {
    oneOf: [
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['local'] },
          path: { type: 'string' },
        },
        required: ['type', 'path'],
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['github'] },
          repo: { type: 'string', description: 'owner/repo format' },
          branch: { type: 'string' },
        },
        required: ['type', 'repo'],
      },
    ],
  },

  HarnessOptions: {
    type: 'object',
    properties: {
      profile: { type: 'string', description: 'Named profile to use' },
      loopStrategy: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['fixed', 'hybrid', 'ralph', 'custom'] },
          maxIterations: { type: 'integer', minimum: 1, maximum: 100 },
          completionCriteria: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      verification: {
        type: 'object',
        properties: {
          waitForCI: { type: 'boolean' },
          skipLevels: {
            type: 'array',
            items: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3'] },
          },
        },
      },
    },
  },

  // Profile schemas
  ProfileSummary: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      extends: { type: 'string', nullable: true },
      isBuiltIn: { type: 'boolean' },
    },
  },

  // Run schemas
  RunSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['queued', 'building', 'running', 'succeeded', 'failed', 'canceled'] },
      startedAt: { type: 'string', format: 'date-time' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
      iterationCount: { type: 'integer' },
    },
  },

  // Audit schemas
  ConfigSnapshot: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      runId: { type: 'string' },
      iteration: { type: 'integer' },
      snapshotAt: { type: 'string', format: 'date-time' },
      configHash: { type: 'string' },
      config: { type: 'object' },
    },
  },
};
```

#### 5.3.5 Add Route-Specific Schemas

Create schema definitions for each endpoint. Example:

```typescript
// Profile CRUD schemas
const createProfileSchema = {
  tags: ['Profiles'],
  summary: 'Create a new profile',
  description: 'Create a new harness profile. Requires API key authentication.',
  security: [{ apiKey: [] }],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$',
        minLength: 1,
        maxLength: 64,
        description: 'Profile name (lowercase alphanumeric with hyphens)',
      },
      description: { type: 'string', maxLength: 256 },
      extends: { type: 'string', description: 'Parent profile to inherit from' },
      loopStrategy: { $ref: '#/components/schemas/LoopStrategyConfig' },
      verification: { $ref: '#/components/schemas/VerificationConfig' },
    },
  },
  response: {
    201: {
      description: 'Profile created',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { $ref: '#/components/schemas/ProfileSummary' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    409: {
      description: 'Profile already exists',
      $ref: '#/components/schemas/Error',
    },
  },
};

// SSE stream schema
const runStreamSchema = {
  tags: ['Streaming'],
  summary: 'Stream run events',
  description: `
Subscribe to real-time events for a run via Server-Sent Events (SSE).

Events include:
- \`connected\` - Initial connection established
- \`iteration-start\` - New iteration beginning
- \`verification-complete\` - Verification level completed
- \`iteration-complete\` - Iteration finished with decision
- \`run-complete\` - Run finished
- \`heartbeat\` - Keep-alive signal (every 30s)
  `,
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Run ID' },
    },
    required: ['id'],
  },
  response: {
    200: {
      description: 'SSE stream',
      content: {
        'text/event-stream': {
          schema: { type: 'string' },
        },
      },
    },
    404: { $ref: '#/components/schemas/Error' },
    409: {
      description: 'Run already completed',
      $ref: '#/components/schemas/Error',
    },
  },
};
```

#### 5.3.6 Generate Static Spec

Create script to generate static OpenAPI spec:

```typescript
// packages/server/scripts/generate-openapi.ts

import { createServer } from '../src/server/index.js';
import { generateOpenAPISpec } from '../src/server/openapi.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const app = await createServer();
  const spec = await generateOpenAPISpec(app);

  const outputPath = join(__dirname, '../../docs/api/openapi.json');
  writeFileSync(outputPath, spec);

  console.log(`OpenAPI spec written to ${outputPath}`);

  await app.close();
}

main().catch(console.error);
```

Add npm script:

```json
{
  "scripts": {
    "openapi:generate": "tsx scripts/generate-openapi.ts"
  }
}
```

#### 5.3.7 Create YAML Version

Also generate YAML version for readability:

```typescript
import YAML from 'yaml';

// In generate-openapi.ts
const yamlSpec = YAML.stringify(JSON.parse(spec));
const yamlPath = join(__dirname, '../../docs/api/openapi.yaml');
writeFileSync(yamlPath, yamlSpec);
```

#### 5.3.8 Register OpenAPI in Server

Update server initialization:

```typescript
// In packages/server/src/server/index.ts

import { registerOpenAPI } from './openapi.js';

export async function createServer(): Promise<FastifyInstance> {
  const app = fastify({ ... });

  // Register OpenAPI (before routes)
  await registerOpenAPI(app);

  // Register routes
  registerWorkOrderRoutes(app);
  registerRunRoutes(app);
  registerProfileRoutes(app);
  registerAuditRoutes(app);
  registerStreamRoutes(app);

  return app;
}
```

### 5.4 Verification Steps

1. Start server and visit `/docs`
2. Verify all endpoints appear in Swagger UI
3. Test API calls from Swagger UI
4. Generate static spec and validate with OpenAPI validator
5. Test code generation with openapi-generator
6. Verify schemas match actual responses

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/openapi.ts` | Created |
| `packages/server/scripts/generate-openapi.ts` | Created |
| `packages/server/package.json` | Modified - add dependencies and script |
| `packages/server/src/server/index.ts` | Modified - register OpenAPI |
| `packages/server/src/server/routes/*.ts` | Modified - add schemas |
| `docs/api/openapi.json` | Generated |
| `docs/api/openapi.yaml` | Generated |

---

## OpenAPI Spec Structure

```yaml
openapi: 3.0.3
info:
  title: AgentGate API
  version: 0.2.17
  description: ...

servers:
  - url: http://localhost:3000
    description: Local development

tags:
  - name: Work Orders
  - name: Runs
  - name: Profiles
  - name: Audit
  - name: Streaming

paths:
  /api/v1/work-orders:
    get: ...
    post: ...
  /api/v1/work-orders/{id}:
    get: ...
    delete: ...
  /api/v1/work-orders/{id}/audit:
    get: ...
  /api/v1/runs:
    get: ...
  /api/v1/runs/{id}:
    get: ...
  /api/v1/runs/{id}/stream:
    get: ...
  /api/v1/profiles:
    get: ...
    post: ...
  /api/v1/profiles/{name}:
    get: ...
    put: ...
    delete: ...
  /api/v1/audit/runs/{runId}:
    get: ...

components:
  securitySchemes:
    apiKey:
      type: apiKey
      name: X-API-Key
      in: header

  schemas:
    Error: ...
    WorkOrderSummary: ...
    ProfileSummary: ...
    RunSummary: ...
    ConfigSnapshot: ...
```

---

## Swagger UI Access

Once deployed, Swagger UI is available at:

- Development: `http://localhost:3000/docs`
- Production: `https://api.agentgate.dev/docs`

Features:
- Interactive API exploration
- Try-it-out functionality
- Schema documentation
- Authentication support
- Request/response examples
