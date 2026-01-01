# 03: Profile CRUD API

This document covers Thrust 2: implementing full profile management via the HTTP API.

---

## Thrust 2: Profile CRUD API

### 2.1 Objective

Implement complete harness profile management through RESTful API endpoints, mirroring the CLI `agentgate profile` commands.

### 2.2 Background

v0.2.16 introduced harness profiles stored in `~/.agentgate/harnesses/`. The CLI provides `profile list/show/create/delete` commands. This thrust exposes the same functionality via API for external tooling.

### 2.3 Subtasks

#### 2.3.1 Create Profile API Types

Create `packages/server/src/server/types/profiles.ts`:

```typescript
import { z } from 'zod';

// Profile list item
export const profileSummarySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  extends: z.string().nullable(),
  isBuiltIn: z.boolean(),
});

export type ProfileSummary = z.infer<typeof profileSummarySchema>;

// Full profile detail
export const profileDetailSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  extends: z.string().nullable(),
  isBuiltIn: z.boolean(),

  loopStrategy: z.object({
    mode: z.string(),
    maxIterations: z.number(),
    // Additional mode-specific fields
    completionCriteria: z.array(z.string()).optional(),
    requireCI: z.boolean().optional(),
    loopDetection: z.boolean().optional(),
    similarityThreshold: z.number().optional(),
  }).optional(),

  verification: z.object({
    gatePlanSource: z.string().optional(),
    waitForCI: z.boolean().optional(),
    skipLevels: z.array(z.string()).optional(),
    ci: z.object({
      timeoutSeconds: z.number().optional(),
      pollIntervalSeconds: z.number().optional(),
      maxIterations: z.number().optional(),
    }).optional(),
  }).optional(),

  gitOps: z.object({
    mode: z.string().optional(),
    branchPattern: z.string().optional(),
    draftPR: z.boolean().optional(),
    prTitlePattern: z.string().optional(),
  }).optional(),

  limits: z.object({
    maxWallClockSeconds: z.number().optional(),
    networkAllowed: z.boolean().optional(),
  }).optional(),

  // Resolved view (if requested)
  resolved: z.object({
    inheritanceChain: z.array(z.string()),
    configHash: z.string(),
  }).optional(),
});

export type ProfileDetail = z.infer<typeof profileDetailSchema>;

// Create/Update profile request
export const createProfileBodySchema = z.object({
  name: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      'Profile name must be lowercase alphanumeric with hyphens'),
  description: z.string().max(256).optional(),
  extends: z.string().optional(),

  loopStrategy: z.object({
    mode: z.enum(['fixed', 'hybrid', 'ralph', 'custom']).optional(),
    maxIterations: z.number().int().min(1).max(100).optional(),
    completionCriteria: z.array(z.string()).optional(),
    requireCI: z.boolean().optional(),
    loopDetection: z.boolean().optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
  }).optional(),

  verification: z.object({
    gatePlanSource: z.enum(['auto', 'inline', 'workspace', 'ci-workflow']).optional(),
    waitForCI: z.boolean().optional(),
    skipLevels: z.array(z.enum(['L0', 'L1', 'L2', 'L3'])).optional(),
    ci: z.object({
      timeoutSeconds: z.number().int().min(60).max(7200).optional(),
      pollIntervalSeconds: z.number().int().min(10).max(300).optional(),
      maxIterations: z.number().int().min(1).max(10).optional(),
    }).optional(),
  }).optional(),

  gitOps: z.object({
    mode: z.enum(['local', 'push-only', 'github-pr']).optional(),
    branchPattern: z.string().optional(),
    draftPR: z.boolean().optional(),
    prTitlePattern: z.string().optional(),
  }).optional(),

  limits: z.object({
    maxWallClockSeconds: z.number().int().min(60).max(86400).optional(),
    networkAllowed: z.boolean().optional(),
  }).optional(),
});

export type CreateProfileBody = z.infer<typeof createProfileBodySchema>;

// Update profile request (all fields optional)
export const updateProfileBodySchema = createProfileBodySchema.partial().omit({ name: true });

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

// Profile name param
export const profileNameParamsSchema = z.object({
  name: z.string().min(1).max(64),
});

export type ProfileNameParams = z.infer<typeof profileNameParamsSchema>;

// Validation result
export const validationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
  warnings: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
  resolved: profileDetailSchema.optional(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;
```

#### 2.3.2 Create Profile Routes

Create `packages/server/src/server/routes/profiles.ts`:

```typescript
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
} from '../../harness/config-loader.js';
import { resolveHarnessConfig } from '../../harness/config-resolver.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:profiles');

// Built-in profiles that cannot be modified
const BUILT_IN_PROFILES = ['default', 'ci-focused', 'rapid-iteration', 'ralph-style'];

export function registerProfileRoutes(app: FastifyInstance): void {
  // Implementation in subtasks below
}
```

#### 2.3.3 Implement GET /api/v1/profiles

List all available profiles:

```typescript
app.get('/api/v1/profiles', async (request, reply) => {
  try {
    const profiles = await listProfiles();

    const items: ProfileSummary[] = profiles.map((p) => ({
      name: p.name,
      description: p.description,
      extends: p.extends,
      isBuiltIn: BUILT_IN_PROFILES.includes(p.name),
    }));

    return reply.send(createSuccessResponse({
      items,
      total: items.length,
    }, request.id));
  } catch (error) {
    logger.error({ err: error }, 'Failed to list profiles');
    return reply.status(500).send(createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'Failed to list profiles',
      undefined,
      request.id
    ));
  }
});
```

#### 2.3.4 Implement GET /api/v1/profiles/:name

Get profile details:

```typescript
app.get<{ Params: ProfileNameParams; Querystring: { resolve?: boolean } }>(
  '/api/v1/profiles/:name',
  async (request, reply) => {
    try {
      const { name } = profileNameParamsSchema.parse(request.params);
      const { resolve } = request.query;

      const profile = await loadProfile(name);
      if (!profile) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Profile not found: ${name}`,
          undefined,
          request.id
        ));
      }

      const detail: ProfileDetail = {
        name: profile.name ?? name,
        description: profile.description ?? null,
        extends: profile.extends ?? null,
        isBuiltIn: BUILT_IN_PROFILES.includes(name),
        loopStrategy: profile.loopStrategy,
        verification: profile.verification,
        gitOps: profile.gitOps,
        limits: profile.limits,
      };

      // Optionally include resolved config
      if (resolve) {
        const resolved = await resolveHarnessConfig({ profileName: name });
        detail.resolved = {
          inheritanceChain: resolved.inheritanceChain,
          configHash: resolved.configHash,
        };
      }

      return reply.send(createSuccessResponse(detail, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get profile');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get profile',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 2.3.5 Implement POST /api/v1/profiles

Create new profile:

```typescript
app.post<{ Body: CreateProfileBody }>(
  '/api/v1/profiles',
  { preHandler: [apiKeyAuth] },
  async (request, reply) => {
    try {
      const bodyResult = createProfileBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Invalid profile configuration',
          { errors: bodyResult.error.errors },
          request.id
        ));
      }

      const body = bodyResult.data;

      // Check if profile already exists
      if (await profileExists(body.name)) {
        return reply.status(409).send(createErrorResponse(
          ErrorCode.CONFLICT,
          `Profile already exists: ${body.name}`,
          undefined,
          request.id
        ));
      }

      // Validate inheritance if extends is set
      if (body.extends && !(await profileExists(body.extends))) {
        return reply.status(400).send(createErrorResponse(
          ErrorCode.BAD_REQUEST,
          `Parent profile not found: ${body.extends}`,
          undefined,
          request.id
        ));
      }

      // Save profile
      await saveProfile(body.name, {
        name: body.name,
        description: body.description,
        extends: body.extends,
        loopStrategy: body.loopStrategy,
        verification: body.verification,
        gitOps: body.gitOps,
        limits: body.limits,
      });

      const profile = await loadProfile(body.name);

      return reply.status(201).send(createSuccessResponse({
        name: body.name,
        description: body.description ?? null,
        extends: body.extends ?? null,
        isBuiltIn: false,
        message: 'Profile created successfully',
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to create profile');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to create profile',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 2.3.6 Implement PUT /api/v1/profiles/:name

Update existing profile:

```typescript
app.put<{ Params: ProfileNameParams; Body: UpdateProfileBody }>(
  '/api/v1/profiles/:name',
  { preHandler: [apiKeyAuth] },
  async (request, reply) => {
    try {
      const { name } = profileNameParamsSchema.parse(request.params);

      // Check if built-in
      if (BUILT_IN_PROFILES.includes(name)) {
        return reply.status(403).send(createErrorResponse(
          ErrorCode.FORBIDDEN,
          `Cannot modify built-in profile: ${name}`,
          undefined,
          request.id
        ));
      }

      // Check if exists
      if (!(await profileExists(name))) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Profile not found: ${name}`,
          undefined,
          request.id
        ));
      }

      const bodyResult = updateProfileBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Invalid profile configuration',
          { errors: bodyResult.error.errors },
          request.id
        ));
      }

      const body = bodyResult.data;

      // Load existing and merge
      const existing = await loadProfile(name);
      const updated = {
        ...existing,
        description: body.description ?? existing?.description,
        extends: body.extends ?? existing?.extends,
        loopStrategy: body.loopStrategy
          ? { ...existing?.loopStrategy, ...body.loopStrategy }
          : existing?.loopStrategy,
        verification: body.verification
          ? { ...existing?.verification, ...body.verification }
          : existing?.verification,
        gitOps: body.gitOps
          ? { ...existing?.gitOps, ...body.gitOps }
          : existing?.gitOps,
        limits: body.limits
          ? { ...existing?.limits, ...body.limits }
          : existing?.limits,
      };

      await saveProfile(name, updated);

      return reply.send(createSuccessResponse({
        name,
        message: 'Profile updated successfully',
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to update profile');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to update profile',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 2.3.7 Implement DELETE /api/v1/profiles/:name

Delete profile:

```typescript
app.delete<{ Params: ProfileNameParams }>(
  '/api/v1/profiles/:name',
  { preHandler: [apiKeyAuth] },
  async (request, reply) => {
    try {
      const { name } = profileNameParamsSchema.parse(request.params);

      // Check if built-in
      if (BUILT_IN_PROFILES.includes(name)) {
        return reply.status(403).send(createErrorResponse(
          ErrorCode.FORBIDDEN,
          `Cannot delete built-in profile: ${name}`,
          undefined,
          request.id
        ));
      }

      // Check if exists
      if (!(await profileExists(name))) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Profile not found: ${name}`,
          undefined,
          request.id
        ));
      }

      // Check for dependents
      const profiles = await listProfiles();
      const dependents = profiles.filter(p => p.extends === name);
      if (dependents.length > 0) {
        return reply.status(409).send(createErrorResponse(
          ErrorCode.CONFLICT,
          `Cannot delete profile: other profiles depend on it`,
          { dependents: dependents.map(p => p.name) },
          request.id
        ));
      }

      await deleteProfile(name);

      return reply.send(createSuccessResponse({
        name,
        message: 'Profile deleted successfully',
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete profile');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to delete profile',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 2.3.8 Implement POST /api/v1/profiles/:name/validate

Validate profile configuration:

```typescript
app.post<{ Params: ProfileNameParams }>(
  '/api/v1/profiles/:name/validate',
  async (request, reply) => {
    try {
      const { name } = profileNameParamsSchema.parse(request.params);

      if (!(await profileExists(name))) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Profile not found: ${name}`,
          undefined,
          request.id
        ));
      }

      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      try {
        const resolved = await resolveHarnessConfig({ profileName: name });
        result.resolved = {
          name: resolved.source,
          description: null,
          extends: null,
          isBuiltIn: BUILT_IN_PROFILES.includes(name),
          loopStrategy: resolved.loopStrategy,
          verification: resolved.verification,
          gitOps: resolved.gitOps,
          limits: resolved.limits,
          resolved: {
            inheritanceChain: resolved.inheritanceChain,
            configHash: resolved.configHash,
          },
        };
      } catch (error) {
        result.valid = false;
        result.errors.push({
          path: '',
          message: error.message,
        });
      }

      // Add warnings for potential issues
      const profile = await loadProfile(name);
      if (profile?.extends && profile.extends === name) {
        result.warnings.push({
          path: 'extends',
          message: 'Profile cannot extend itself',
        });
        result.valid = false;
        result.errors.push({
          path: 'extends',
          message: 'Circular inheritance detected',
        });
      }

      return reply.send(createSuccessResponse(result, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to validate profile');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to validate profile',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 2.3.9 Register Routes

Update `packages/server/src/server/index.ts`:

```typescript
import { registerProfileRoutes } from './routes/profiles.js';

// In server setup
registerProfileRoutes(app);
```

### 2.4 Verification Steps

1. Test list profiles returns all profiles
2. Test get profile with and without resolve
3. Test create new profile
4. Test create fails for duplicate name
5. Test update existing profile
6. Test update fails for built-in profile
7. Test delete profile
8. Test delete fails for built-in profile
9. Test delete fails if other profiles depend on it
10. Test validate with valid and invalid profiles

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/types/profiles.ts` | Created |
| `packages/server/src/server/routes/profiles.ts` | Created |
| `packages/server/src/server/index.ts` | Modified - register routes |
| `packages/server/test/server/profiles.test.ts` | Created |

---

## API Reference

### List Profiles

```
GET /api/v1/profiles
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "name": "default",
        "description": "Balanced hybrid strategy",
        "extends": null,
        "isBuiltIn": true
      },
      {
        "name": "ci-focused",
        "description": "CI-focused workflow",
        "extends": "default",
        "isBuiltIn": true
      },
      {
        "name": "my-profile",
        "description": "Custom profile",
        "extends": "default",
        "isBuiltIn": false
      }
    ],
    "total": 3
  }
}
```

### Get Profile

```
GET /api/v1/profiles/:name
GET /api/v1/profiles/:name?resolve=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "ci-focused",
    "description": "CI-focused workflow with GitHub integration",
    "extends": "default",
    "isBuiltIn": true,
    "loopStrategy": {
      "mode": "hybrid",
      "maxIterations": 8,
      "requireCI": true
    },
    "verification": {
      "waitForCI": true
    },
    "resolved": {
      "inheritanceChain": ["default", "ci-focused"],
      "configHash": "abc123def456"
    }
  }
}
```

### Create Profile

```
POST /api/v1/profiles
X-API-Key: <key>
```

**Request:**
```json
{
  "name": "my-custom",
  "description": "My custom profile",
  "extends": "default",
  "loopStrategy": {
    "maxIterations": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "my-custom",
    "description": "My custom profile",
    "extends": "default",
    "isBuiltIn": false,
    "message": "Profile created successfully"
  }
}
```

### Update Profile

```
PUT /api/v1/profiles/:name
X-API-Key: <key>
```

**Request:**
```json
{
  "description": "Updated description",
  "loopStrategy": {
    "maxIterations": 15
  }
}
```

### Delete Profile

```
DELETE /api/v1/profiles/:name
X-API-Key: <key>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "my-custom",
    "message": "Profile deleted successfully"
  }
}
```

### Validate Profile

```
POST /api/v1/profiles/:name/validate
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [],
    "resolved": { ... }
  }
}
```

---

## Error Cases

| Scenario | Status | Code |
|----------|--------|------|
| Profile not found | 404 | NOT_FOUND |
| Profile already exists | 409 | CONFLICT |
| Cannot modify built-in | 403 | FORBIDDEN |
| Invalid configuration | 400 | BAD_REQUEST |
| Profile has dependents | 409 | CONFLICT |
| Parent profile not found | 400 | BAD_REQUEST |
