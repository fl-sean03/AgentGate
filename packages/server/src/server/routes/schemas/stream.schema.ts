/**
 * OpenAPI Schemas for Stream Routes
 *
 * Defines Fastify route schemas with OpenAPI annotations for streaming endpoints.
 * v0.2.17 - Thrust 5
 *
 * @module server/routes/schemas/stream
 */

import type { FastifySchema } from 'fastify';

/**
 * GET /api/v1/runs/:id/stream - Stream run events via SSE
 */
export const runStreamSchema: FastifySchema = {
  tags: ['Streaming'],
  summary: 'Stream run events',
  description: `
Subscribe to real-time events for a run via Server-Sent Events (SSE).

## Event Types

- \`connected\` - Initial connection established, includes current run state
- \`iteration-start\` - New iteration beginning
- \`verification-complete\` - Verification level completed
- \`iteration-complete\` - Iteration finished with decision
- \`run-complete\` - Run finished (succeeded, failed, or canceled)
- \`heartbeat\` - Keep-alive signal (every 30s)
- \`error\` - Error occurred during streaming

## Example Usage

\`\`\`javascript
const eventSource = new EventSource('/api/v1/runs/abc123/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(\`Event: \${data.type}\`, data);
};

eventSource.addEventListener('run-complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('Run completed:', data.data.status);
  eventSource.close();
});
\`\`\`
  `,
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
      description: 'SSE stream',
      content: {
        'text/event-stream': {
          schema: {
            type: 'string',
            description: 'Server-Sent Events stream',
          },
        },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Run not found',
      $ref: '#/components/schemas/Error',
    },
  },
};

/**
 * GET /api/v1/runs/:id/config - Get current run configuration
 */
export const getRunConfigSchema: FastifySchema = {
  tags: ['Runs', 'Streaming'],
  summary: 'Get current run configuration',
  description: 'Get the current configuration state for a run. Useful for polling or initial state retrieval before starting SSE streaming.',
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
        data: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            workOrderId: { type: 'string' },
            state: { type: 'string' },
            iteration: { type: 'integer' },
            startedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
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
