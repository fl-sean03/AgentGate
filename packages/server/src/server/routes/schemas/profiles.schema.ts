/**
 * OpenAPI Schemas for Profiles Routes
 *
 * Defines Fastify route schemas with OpenAPI annotations for profile endpoints.
 * v0.2.17 - Thrust 5
 *
 * @module server/routes/schemas/profiles
 */

import type { FastifySchema } from 'fastify';

/**
 * GET /api/v1/profiles - List all profiles
 */
export const listProfilesSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'List all profiles',
  description: 'Get a list of all available harness profiles, including built-in and custom profiles.',
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
              items: { $ref: '#/components/schemas/ProfileSummary' },
            },
            total: { type: 'integer' },
          },
        },
        requestId: { type: 'string' },
      },
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * GET /api/v1/profiles/:name - Get profile details
 */
export const getProfileSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'Get profile details',
  description: `
Get detailed information about a specific harness profile.

Use the \`resolve=true\` query parameter to include the fully resolved configuration with inheritance applied.
  `,
  params: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Profile name',
        pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$',
      },
    },
    required: ['name'],
  },
  querystring: {
    type: 'object',
    properties: {
      resolve: {
        type: 'string',
        enum: ['true', 'false'],
        description: 'Include resolved configuration with inheritance',
      },
    },
  },
  response: {
    200: {
      description: 'Successful response',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: { $ref: '#/components/schemas/ProfileDetail' },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Profile not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * POST /api/v1/profiles - Create a new profile
 */
export const createProfileSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'Create a new profile',
  description: `
Create a new harness profile. Requires API key authentication.

Profiles can extend other profiles using the \`extends\` field to inherit configuration.
  `,
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
      description: {
        type: 'string',
        maxLength: 256,
        description: 'Profile description',
      },
      extends: {
        type: 'string',
        description: 'Parent profile to inherit from',
      },
      loopStrategy: { $ref: '#/components/schemas/LoopStrategyConfig' },
      verification: { $ref: '#/components/schemas/VerificationConfig' },
      gitOps: { $ref: '#/components/schemas/GitOpsConfig' },
      executionLimits: { $ref: '#/components/schemas/ExecutionLimitsConfig' },
    },
  },
  response: {
    201: {
      description: 'Profile created successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            extends: { type: 'string', nullable: true },
            isBuiltIn: { type: 'boolean', enum: [false] },
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
    409: {
      description: 'Profile already exists',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * PUT /api/v1/profiles/:name - Update an existing profile
 */
export const updateProfileSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'Update an existing profile',
  description: `
Update an existing harness profile. Requires API key authentication.

Built-in profiles cannot be modified. Only fields provided in the request body will be updated.
  `,
  security: [{ apiKey: [] }],
  params: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Profile name',
      },
    },
    required: ['name'],
  },
  body: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        maxLength: 256,
        description: 'Profile description',
      },
      extends: {
        type: 'string',
        nullable: true,
        description: 'Parent profile to inherit from',
      },
      loopStrategy: { $ref: '#/components/schemas/LoopStrategyConfig' },
      verification: { $ref: '#/components/schemas/VerificationConfig' },
      gitOps: { $ref: '#/components/schemas/GitOpsConfig' },
      executionLimits: { $ref: '#/components/schemas/ExecutionLimitsConfig' },
    },
  },
  response: {
    200: {
      description: 'Profile updated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
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
    403: {
      description: 'Cannot modify built-in profile',
      $ref: '#/components/schemas/Error',
    },
    404: {
      description: 'Profile not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * DELETE /api/v1/profiles/:name - Delete a profile
 */
export const deleteProfileSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'Delete a profile',
  description: `
Delete a harness profile. Requires API key authentication.

Built-in profiles cannot be deleted. Profiles with dependents (other profiles that extend them) cannot be deleted.
  `,
  security: [{ apiKey: [] }],
  params: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Profile name',
      },
    },
    required: ['name'],
  },
  response: {
    200: {
      description: 'Profile deleted successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
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
    403: {
      description: 'Cannot delete built-in profile',
      $ref: '#/components/schemas/Error',
    },
    404: {
      description: 'Profile not found',
      $ref: '#/components/schemas/Error',
    },
    409: {
      description: 'Cannot delete profile with dependents',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};

/**
 * POST /api/v1/profiles/:name/validate - Validate a profile configuration
 */
export const validateProfileSchema: FastifySchema = {
  tags: ['Profiles'],
  summary: 'Validate a profile configuration',
  description: 'Validate a profile configuration, checking for inheritance issues and configuration errors.',
  params: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Profile name',
      },
    },
    required: ['name'],
  },
  response: {
    200: {
      description: 'Validation result',
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            resolved: { $ref: '#/components/schemas/ProfileDetail' },
          },
        },
        requestId: { type: 'string' },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    404: {
      description: 'Profile not found',
      $ref: '#/components/schemas/Error',
    },
    500: { $ref: '#/components/schemas/Error' },
  },
};
