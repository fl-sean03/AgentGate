/**
 * Profile Routes
 *
 * RESTful API endpoints for harness profile management.
 * v0.2.17 - Thrust 2
 *
 * @module server/routes/profiles
 */

import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import { apiKeyAuth } from '../middleware/auth.js';
import {
  profileNameParamsSchema,
  createProfileBodySchema,
  updateProfileBodySchema,
  type ProfileSummary,
  type ProfileDetail,
  type CreateProfileBody,
  type UpdateProfileBody,
  type ProfileNameParams,
  type ValidationResult,
} from '../types/profiles.js';
import {
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
  profileExists,
  type HarnessProfileInfo,
} from '../../harness/config-loader.js';
import { resolveHarnessConfig, computeConfigHash } from '../../harness/config-resolver.js';
import type { HarnessConfig } from '../../types/harness-config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:profiles');

// Built-in profiles that cannot be modified or deleted
const BUILT_IN_PROFILES = ['default', 'ci-focused', 'rapid-iteration', 'ralph-style'];

/**
 * Convert HarnessConfig to ProfileDetail for API response
 */
function configToProfileDetail(
  name: string,
  config: HarnessConfig,
  info: HarnessProfileInfo | null
): ProfileDetail {
  return {
    name,
    description: (config.metadata?.description as string) ?? info?.description ?? null,
    extends: (config.metadata?.extends as string) ?? info?.extends ?? null,
    isBuiltIn: BUILT_IN_PROFILES.includes(name),
    loopStrategy: config.loopStrategy,
    verification: config.verification,
    gitOps: config.gitOps,
    executionLimits: config.executionLimits,
  };
}

/**
 * Register profile API routes
 */
export function registerProfileRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/profiles - List all available profiles
   */
  app.get('/api/v1/profiles', async (request, reply) => {
    try {
      const profiles = await listProfiles();

      const items: ProfileSummary[] = profiles.map((p) => ({
        name: p.name,
        description: p.description,
        extends: p.extends,
        isBuiltIn: BUILT_IN_PROFILES.includes(p.name),
      }));

      return reply.send(
        createSuccessResponse(
          {
            items,
            total: items.length,
          },
          request.id
        )
      );
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to list profiles');
      return reply.status(500).send(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to list profiles', undefined, request.id)
      );
    }
  });

  /**
   * GET /api/v1/profiles/:name - Get profile details
   */
  app.get<{ Params: ProfileNameParams; Querystring: { resolve?: string } }>(
    '/api/v1/profiles/:name',
    async (request, reply) => {
      try {
        const paramsResult = profileNameParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile name',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { name } = paramsResult.data;
        const shouldResolve = request.query.resolve === 'true';

        // Check if profile exists
        if (!(await profileExists(name))) {
          return reply.status(404).send(
            createErrorResponse(ErrorCode.NOT_FOUND, `Profile not found: ${name}`, undefined, request.id)
          );
        }

        // Load the profile
        const config = await loadProfile(name);
        const profiles = await listProfiles();
        const info = profiles.find((p) => p.name === name) ?? null;

        const detail: ProfileDetail = configToProfileDetail(name, config, info);

        // Optionally resolve the full config with inheritance
        if (shouldResolve) {
          try {
            const resolved = await resolveHarnessConfig({ profileName: name });
            const hash = computeConfigHash(resolved);

            // Build inheritance chain from metadata
            const inheritanceChain: string[] = [name];
            let current = config.metadata?.extends as string | undefined;
            while (current) {
              inheritanceChain.unshift(current);
              try {
                const parentConfig = await loadProfile(current);
                current = parentConfig.metadata?.extends as string | undefined;
              } catch {
                break;
              }
            }

            detail.resolved = {
              inheritanceChain,
              configHash: hash,
            };
          } catch (err) {
            logger.warn({ err, name }, 'Failed to resolve profile config');
          }
        }

        return reply.send(createSuccessResponse(detail, request.id));
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to get profile');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get profile', undefined, request.id)
        );
      }
    }
  );

  /**
   * POST /api/v1/profiles - Create a new profile
   * Requires authentication
   */
  app.post<{ Body: CreateProfileBody }>(
    '/api/v1/profiles',
    { preHandler: [apiKeyAuth] },
    async (request, reply) => {
      try {
        const bodyResult = createProfileBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile configuration',
              { errors: bodyResult.error.errors },
              request.id
            )
          );
        }

        const body = bodyResult.data;

        // Check if profile already exists
        if (await profileExists(body.name)) {
          return reply.status(409).send(
            createErrorResponse(ErrorCode.CONFLICT, `Profile already exists: ${body.name}`, undefined, request.id)
          );
        }

        // Validate inheritance if extends is set
        if (body.extends && !(await profileExists(body.extends))) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              `Parent profile not found: ${body.extends}`,
              undefined,
              request.id
            )
          );
        }

        // Build harness config from body - use partial and let saveProfile validate
        const configData = {
          version: '1.0' as const,
          metadata: {
            name: body.name,
            description: body.description,
            extends: body.extends,
          },
          loopStrategy: body.loopStrategy,
          verification: body.verification,
          gitOps: body.gitOps,
          executionLimits: body.executionLimits,
        };

        // Save profile (saveProfile will validate and apply defaults)
        await saveProfile(body.name, configData as HarnessConfig);

        logger.info({ name: body.name }, 'Profile created');

        return reply.status(201).send(
          createSuccessResponse(
            {
              name: body.name,
              description: body.description ?? null,
              extends: body.extends ?? null,
              isBuiltIn: false,
              message: 'Profile created successfully',
            },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to create profile');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create profile', undefined, request.id)
        );
      }
    }
  );

  /**
   * PUT /api/v1/profiles/:name - Update an existing profile
   * Requires authentication
   */
  app.put<{ Params: ProfileNameParams; Body: UpdateProfileBody }>(
    '/api/v1/profiles/:name',
    { preHandler: [apiKeyAuth] },
    async (request, reply) => {
      try {
        const paramsResult = profileNameParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile name',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { name } = paramsResult.data;

        // Check if built-in
        if (BUILT_IN_PROFILES.includes(name)) {
          return reply.status(403).send(
            createErrorResponse(ErrorCode.FORBIDDEN, `Cannot modify built-in profile: ${name}`, undefined, request.id)
          );
        }

        // Check if exists
        if (!(await profileExists(name))) {
          return reply.status(404).send(
            createErrorResponse(ErrorCode.NOT_FOUND, `Profile not found: ${name}`, undefined, request.id)
          );
        }

        const bodyResult = updateProfileBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile configuration',
              { errors: bodyResult.error.errors },
              request.id
            )
          );
        }

        const body = bodyResult.data;

        // Validate inheritance if extends is being changed
        if (body.extends !== undefined && body.extends && !(await profileExists(body.extends))) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              `Parent profile not found: ${body.extends}`,
              undefined,
              request.id
            )
          );
        }

        // Check for circular inheritance
        if (body.extends === name) {
          return reply.status(400).send(
            createErrorResponse(ErrorCode.BAD_REQUEST, 'Profile cannot extend itself', undefined, request.id)
          );
        }

        // Load existing and merge
        const existing = await loadProfile(name);
        const updatedData = {
          version: '1.0' as const,
          metadata: {
            ...existing.metadata,
            name,
            description: body.description ?? existing.metadata?.description,
            extends: body.extends ?? existing.metadata?.extends,
          },
          loopStrategy: body.loopStrategy
            ? { ...existing.loopStrategy, ...body.loopStrategy }
            : existing.loopStrategy,
          verification: body.verification
            ? { ...existing.verification, ...body.verification }
            : existing.verification,
          gitOps: body.gitOps ? { ...existing.gitOps, ...body.gitOps } : existing.gitOps,
          executionLimits: body.executionLimits
            ? { ...existing.executionLimits, ...body.executionLimits }
            : existing.executionLimits,
        };

        await saveProfile(name, updatedData as HarnessConfig);

        logger.info({ name }, 'Profile updated');

        return reply.send(
          createSuccessResponse(
            {
              name,
              message: 'Profile updated successfully',
            },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to update profile');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to update profile', undefined, request.id)
        );
      }
    }
  );

  /**
   * DELETE /api/v1/profiles/:name - Delete a profile
   * Requires authentication
   */
  app.delete<{ Params: ProfileNameParams }>(
    '/api/v1/profiles/:name',
    { preHandler: [apiKeyAuth] },
    async (request, reply) => {
      try {
        const paramsResult = profileNameParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile name',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { name } = paramsResult.data;

        // Check if built-in
        if (BUILT_IN_PROFILES.includes(name)) {
          return reply.status(403).send(
            createErrorResponse(ErrorCode.FORBIDDEN, `Cannot delete built-in profile: ${name}`, undefined, request.id)
          );
        }

        // Check if exists
        if (!(await profileExists(name))) {
          return reply.status(404).send(
            createErrorResponse(ErrorCode.NOT_FOUND, `Profile not found: ${name}`, undefined, request.id)
          );
        }

        // Check for dependents
        const profiles = await listProfiles();
        const dependents = profiles.filter((p) => p.extends === name);
        if (dependents.length > 0) {
          return reply.status(409).send(
            createErrorResponse(
              ErrorCode.CONFLICT,
              'Cannot delete profile: other profiles depend on it',
              { dependents: dependents.map((p) => p.name) },
              request.id
            )
          );
        }

        await deleteProfile(name);

        logger.info({ name }, 'Profile deleted');

        return reply.send(
          createSuccessResponse(
            {
              name,
              message: 'Profile deleted successfully',
            },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to delete profile');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to delete profile', undefined, request.id)
        );
      }
    }
  );

  /**
   * POST /api/v1/profiles/:name/validate - Validate a profile configuration
   */
  app.post<{ Params: ProfileNameParams }>(
    '/api/v1/profiles/:name/validate',
    async (request, reply) => {
      try {
        const paramsResult = profileNameParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid profile name',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { name } = paramsResult.data;

        // Check if exists
        if (!(await profileExists(name))) {
          return reply.status(404).send(
            createErrorResponse(ErrorCode.NOT_FOUND, `Profile not found: ${name}`, undefined, request.id)
          );
        }

        const result: ValidationResult = {
          valid: true,
          errors: [],
          warnings: [],
        };

        // Load and validate profile
        const config = await loadProfile(name);
        const profiles = await listProfiles();
        const info = profiles.find((p) => p.name === name) ?? null;

        // Check for self-extension
        if (config.metadata?.extends === name) {
          result.valid = false;
          result.errors.push({
            path: 'extends',
            message: 'Profile cannot extend itself',
          });
        }

        // Try to resolve the full config
        try {
          const resolved = await resolveHarnessConfig({ profileName: name });
          const hash = computeConfigHash(resolved);

          // Build inheritance chain
          const inheritanceChain: string[] = [name];
          let current = config.metadata?.extends as string | undefined;
          while (current) {
            if (inheritanceChain.includes(current)) {
              result.valid = false;
              result.errors.push({
                path: 'extends',
                message: `Circular inheritance detected: ${inheritanceChain.join(' -> ')} -> ${current}`,
              });
              break;
            }
            inheritanceChain.unshift(current);
            try {
              const parentConfig = await loadProfile(current);
              current = parentConfig.metadata?.extends as string | undefined;
            } catch {
              result.warnings.push({
                path: 'extends',
                message: `Parent profile '${current}' could not be loaded`,
              });
              break;
            }
          }

          result.resolved = {
            ...configToProfileDetail(name, config, info),
            resolved: {
              inheritanceChain,
              configHash: hash,
            },
          };
        } catch (error) {
          result.valid = false;
          result.errors.push({
            path: '',
            message: error instanceof Error ? error.message : 'Unknown error resolving config',
          });
        }

        return reply.send(createSuccessResponse(result, request.id));
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to validate profile');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to validate profile', undefined, request.id)
        );
      }
    }
  );
}
