import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createErrorResponse, ErrorCode } from '../types.js';

/**
 * API key stored in server config
 */
let configuredApiKey: string | undefined;

/**
 * Optional external API key validator for organization/user keys.
 * This allows the SaaS server to inject its own validation logic.
 */
let externalKeyValidator: ExternalKeyValidator | undefined;

/**
 * External key validator function type.
 * Returns validated key info if valid, null if invalid.
 */
export type ExternalKeyValidator = (
  apiKey: string
) => Promise<ValidatedKeyInfo | null>;

/**
 * Validated key information returned by external validator
 */
export interface ValidatedKeyInfo {
  type: 'user' | 'organization';
  id: string; // userId or organizationId
  scopes?: string[];
}

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
 * Set an external key validator for organization/user API keys.
 * This allows multi-tenant authentication via external systems.
 */
export function setExternalKeyValidator(
  validator: ExternalKeyValidator | undefined
): void {
  externalKeyValidator = validator;
}

/**
 * Check if a key is an organization API key (org_live_* or org_test_*)
 */
export function isOrganizationKey(key: string): boolean {
  return key.startsWith('org_live_') || key.startsWith('org_test_');
}

/**
 * Check if a key is a user API key (user_* or personal API key format)
 */
export function isUserKey(key: string): boolean {
  return key.startsWith('user_') || key.startsWith('sk_');
}

/**
 * API key authentication preHandler
 * Validates Authorization: Bearer <key> header
 *
 * Supports three types of authentication:
 * 1. Static server API key (AGENTGATE_API_KEY)
 * 2. Organization API keys (org_live_*, org_test_*) via external validator
 * 3. User API keys (user_*, sk_*) via external validator
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If no API key is configured and no external validator, skip auth
  if (!configuredApiKey && !externalKeyValidator) {
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

  // Check static API key first (fastest path)
  if (configuredApiKey && token === configuredApiKey) {
    // Store the API key on the request for downstream use
    (request as FastifyRequest & { apiKey?: string }).apiKey = token;
    return; // Auth successful
  }

  // Check for organization or user keys via external validator
  if (externalKeyValidator && (isOrganizationKey(token) || isUserKey(token))) {
    try {
      const validatedKey = await externalKeyValidator(token);
      if (validatedKey) {
        // Store validated key info on the request for downstream use
        const extRequest = request as FastifyRequest & {
          apiKey?: string;
          validatedKey?: ValidatedKeyInfo;
        };
        extRequest.apiKey = token;
        extRequest.validatedKey = validatedKey;
        return; // Auth successful
      }
    } catch (error) {
      // Log error but continue to return unauthorized
      console.error('[auth] External key validation failed:', error);
    }
  }

  // No valid authentication found
  return reply.status(401).send(
    createErrorResponse(
      ErrorCode.UNAUTHORIZED,
      'Invalid API key',
      undefined,
      request.id
    )
  );
}

/**
 * Register auth plugin with Fastify
 */
export function registerAuthPlugin(
  app: FastifyInstance,
  apiKey?: string,
  keyValidator?: ExternalKeyValidator
): void {
  if (apiKey) {
    setApiKey(apiKey);
  }
  if (keyValidator) {
    setExternalKeyValidator(keyValidator);
  }
}
