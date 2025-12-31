import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createErrorResponse, ErrorCode } from '../types.js';

/**
 * API key stored in server config
 */
let configuredApiKey: string | undefined;

/**
 * Set the API key for authentication
 */
export function setApiKey(key: string | undefined): void {
  configuredApiKey = key;
}

/**
 * Get the configured API key
 */
export function getApiKey(): string | undefined {
  return configuredApiKey;
}

/**
 * API key authentication preHandler
 * Validates Authorization: Bearer <key> header
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If no API key is configured, skip auth
  if (!configuredApiKey) {
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send(
      createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        'Authorization header required',
        undefined,
        request.id
      )
    );
  }

  // Check for Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return reply.status(401).send(
      createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        'Invalid authorization format. Use: Bearer <api-key>',
        undefined,
        request.id
      )
    );
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  if (token !== configuredApiKey) {
    return reply.status(401).send(
      createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        'Invalid API key',
        undefined,
        request.id
      )
    );
  }

  // Auth successful - continue
}

/**
 * Register auth plugin with Fastify
 */
export function registerAuthPlugin(app: FastifyInstance, apiKey?: string): void {
  if (apiKey) {
    setApiKey(apiKey);
  }
}
