# 04: Thrust 3 - Profile API Integration

## Objective

Implement the React Query hooks and API client functions for profile CRUD operations, enabling the profile UI components to interact with the server.

---

## API Endpoints

### Profile Endpoints Summary

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | /api/v1/profiles | List all profiles | No |
| GET | /api/v1/profiles/:name | Get single profile | No |
| GET | /api/v1/profiles/:name?resolve=true | Get resolved config | No |
| POST | /api/v1/profiles | Create new profile | Yes |
| PUT | /api/v1/profiles/:name | Update profile | Yes |
| DELETE | /api/v1/profiles/:name | Delete profile | Yes |
| POST | /api/v1/profiles/:name/validate | Validate profile | Yes |

---

## Request/Response Specifications

### List Profiles (GET /api/v1/profiles)

**Response:**
```
{
  "success": true,
  "data": [
    {
      "name": "default",
      "description": "Default configuration",
      "extends": null,
      "config": { ... },
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    },
    {
      "name": "fast-iteration",
      "description": "Quick iterations",
      "extends": "default",
      "config": { "loopStrategy": { "maxIterations": 3 } },
      "createdAt": "2026-01-02T00:00:00Z",
      "updatedAt": "2026-01-02T00:00:00Z"
    }
  ],
  "meta": {
    "timestamp": "2026-01-02T12:00:00Z",
    "requestId": "abc123"
  }
}
```

### Get Single Profile (GET /api/v1/profiles/:name)

**Response (without resolve):**
```
{
  "success": true,
  "data": {
    "name": "fast-iteration",
    "description": "Quick iterations",
    "extends": "default",
    "config": { "loopStrategy": { "maxIterations": 3 } },
    "createdAt": "2026-01-02T00:00:00Z",
    "updatedAt": "2026-01-02T00:00:00Z"
  }
}
```

**Response (with resolve=true):**
```
{
  "success": true,
  "data": {
    "name": "fast-iteration",
    "description": "Quick iterations",
    "extends": "default",
    "config": {
      "loopStrategy": {
        "mode": "iterative",
        "maxIterations": 3
      },
      "verification": {
        "waitForCI": true,
        "skipLevels": []
      },
      ...
    },
    "resolvedFrom": ["fast-iteration", "default"],
    "createdAt": "2026-01-02T00:00:00Z",
    "updatedAt": "2026-01-02T00:00:00Z"
  }
}
```

### Create Profile (POST /api/v1/profiles)

**Request:**
```
{
  "name": "my-profile",
  "description": "My custom profile",
  "extends": "default",
  "config": {
    "loopStrategy": { "maxIterations": 5 }
  }
}
```

**Response (201 Created):**
```
{
  "success": true,
  "data": {
    "name": "my-profile",
    "description": "My custom profile",
    "extends": "default",
    "config": { "loopStrategy": { "maxIterations": 5 } },
    "createdAt": "2026-01-02T12:00:00Z",
    "updatedAt": "2026-01-02T12:00:00Z"
  }
}
```

### Update Profile (PUT /api/v1/profiles/:name)

**Request:**
```
{
  "description": "Updated description",
  "extends": "default",
  "config": {
    "loopStrategy": { "maxIterations": 10 }
  }
}
```

**Response (200 OK):**
```
{
  "success": true,
  "data": {
    "name": "my-profile",
    "description": "Updated description",
    "extends": "default",
    "config": { "loopStrategy": { "maxIterations": 10 } },
    "createdAt": "2026-01-02T12:00:00Z",
    "updatedAt": "2026-01-02T12:30:00Z"
  }
}
```

### Delete Profile (DELETE /api/v1/profiles/:name)

**Response (200 OK):**
```
{
  "success": true,
  "data": {
    "deleted": true,
    "name": "my-profile"
  }
}
```

### Validate Profile (POST /api/v1/profiles/:name/validate)

**Response (200 OK - Valid):**
```
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

**Response (200 OK - Invalid):**
```
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      {
        "path": "config.loopStrategy.maxIterations",
        "message": "Must be between 1 and 20"
      }
    ],
    "warnings": [
      {
        "path": "config.unknownField",
        "message": "Unknown field will be ignored"
      }
    ]
  }
}
```

---

## Error Responses

### 404 Not Found
```
{
  "success": false,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "Profile 'nonexistent' not found"
  }
}
```

### 409 Conflict (Name Already Exists)
```
{
  "success": false,
  "error": {
    "code": "PROFILE_EXISTS",
    "message": "Profile 'my-profile' already exists"
  }
}
```

### 400 Bad Request (Validation Error)
```
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid profile configuration",
    "details": [
      { "path": "name", "message": "Name is required" }
    ]
  }
}
```

### 403 Forbidden (Protected Profile)
```
{
  "success": false,
  "error": {
    "code": "PROFILE_PROTECTED",
    "message": "Cannot delete the default profile"
  }
}
```

---

## API Client Implementation

### File: src/api/profiles.ts

**Functions to Implement:**

| Function | Purpose | HTTP Method |
|----------|---------|-------------|
| listProfiles | Get all profiles | GET /profiles |
| getProfile | Get single profile | GET /profiles/:name |
| getResolvedProfile | Get profile with inheritance resolved | GET /profiles/:name?resolve=true |
| createProfile | Create new profile | POST /profiles |
| updateProfile | Update existing profile | PUT /profiles/:name |
| deleteProfile | Delete profile | DELETE /profiles/:name |
| validateProfile | Validate profile config | POST /profiles/:name/validate |

**Error Handling:**

All functions should:
1. Use the existing client.ts base client
2. Unwrap the response data (extract from success/data wrapper)
3. Throw typed errors for API failures
4. Include request/response logging in development

---

## React Query Hooks

### File: src/hooks/useProfiles.ts

**Hooks to Implement:**

| Hook | Purpose | Query/Mutation |
|------|---------|----------------|
| useProfiles | Fetch all profiles | Query |
| useProfile | Fetch single profile | Query |
| useResolvedProfile | Fetch resolved profile | Query |
| useCreateProfile | Create profile | Mutation |
| useUpdateProfile | Update profile | Mutation |
| useDeleteProfile | Delete profile | Mutation |
| useValidateProfile | Validate profile | Mutation |

### Query Configuration

**useProfiles:**
- Query key: `['profiles']`
- Stale time: 30 seconds
- Refetch on window focus: Yes
- Retry: 3 times with exponential backoff

**useProfile:**
- Query key: `['profiles', name]`
- Stale time: 30 seconds
- Enabled: Only when name is provided

**useResolvedProfile:**
- Query key: `['profiles', name, 'resolved']`
- Stale time: 30 seconds
- Enabled: Only when name is provided

### Mutation Configuration

**useCreateProfile:**
- On success: Invalidate `['profiles']` query
- On success: Navigate to profile list or new profile
- On error: Show toast with error message

**useUpdateProfile:**
- On success: Invalidate `['profiles']` and `['profiles', name]`
- Optimistic update: Update cache immediately
- On error: Rollback cache, show toast

**useDeleteProfile:**
- On success: Invalidate `['profiles']`
- Optimistic update: Remove from list immediately
- On error: Restore to list, show toast

---

## Cache Invalidation Strategy

### When Creating Profile
1. Invalidate profiles list
2. New profile appears in list automatically

### When Updating Profile
1. Invalidate specific profile query
2. Invalidate profiles list
3. Invalidate any resolved profile queries for this profile

### When Deleting Profile
1. Invalidate profiles list
2. Remove specific profile from cache
3. Note: Profiles extending deleted profile may need refresh

### When Profile Extends Another
1. Resolved config queries for child profiles should invalidate when parent changes
2. Consider using query keys that include the extends chain

---

## Optimistic Updates

### Delete Profile

1. Before mutation: Remove profile from cache
2. Save original list for potential rollback
3. On success: Keep removal, show success toast
4. On error: Restore original list, show error toast

### Update Profile

1. Before mutation: Update profile in cache with new values
2. Save original profile for potential rollback
3. On success: Keep update, show success toast
4. On error: Restore original profile, show error toast

---

## TypeScript Types

### Profile Type
```
interface Profile {
  name: string;
  description: string | null;
  extends: string | null;
  config: HarnessConfig;
  createdAt: string;
  updatedAt: string;
}
```

### ResolvedProfile Type
```
interface ResolvedProfile extends Profile {
  resolvedFrom: string[];
}
```

### CreateProfileRequest Type
```
interface CreateProfileRequest {
  name: string;
  description?: string;
  extends?: string;
  config?: Partial<HarnessConfig>;
}
```

### UpdateProfileRequest Type
```
interface UpdateProfileRequest {
  description?: string;
  extends?: string | null;
  config?: Partial<HarnessConfig>;
}
```

### ValidationResult Type
```
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  path: string;
  message: string;
}

interface ValidationWarning {
  path: string;
  message: string;
}
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC3.1 | listProfiles returns all profiles | Call API, verify response |
| AC3.2 | getProfile returns single profile | Call with valid name |
| AC3.3 | getProfile returns 404 for unknown | Call with invalid name |
| AC3.4 | getResolvedProfile includes inheritance | Verify merged config |
| AC3.5 | createProfile creates new profile | Create and verify exists |
| AC3.6 | createProfile rejects duplicate name | Try duplicate, verify error |
| AC3.7 | updateProfile modifies profile | Update and verify changes |
| AC3.8 | deleteProfile removes profile | Delete and verify gone |
| AC3.9 | deleteProfile rejects default | Try delete default, verify error |
| AC3.10 | useProfiles hook fetches data | Mount component, verify data |
| AC3.11 | Cache invalidation works | Create profile, verify list updates |
| AC3.12 | Optimistic delete works | Delete, verify immediate removal |
| AC3.13 | Rollback on error works | Mock error, verify restoration |

---

## Test Cases

### API Client Tests

| Test | Description |
|------|-------------|
| listProfiles success | Mock 200, verify data returned |
| listProfiles error | Mock 500, verify error thrown |
| getProfile success | Mock 200, verify profile returned |
| getProfile 404 | Mock 404, verify error thrown |
| createProfile success | Mock 201, verify profile returned |
| createProfile conflict | Mock 409, verify error with code |
| updateProfile success | Mock 200, verify updated profile |
| deleteProfile success | Mock 200, verify success |
| deleteProfile protected | Mock 403, verify error |

### React Query Hook Tests

| Test | Description |
|------|-------------|
| useProfiles loading state | Verify isLoading true initially |
| useProfiles success state | Verify data populated |
| useProfiles error state | Verify error populated |
| useCreateProfile mutation | Verify mutate function works |
| Cache invalidation | Create profile, verify list refetched |
| Optimistic update | Delete, verify immediate UI update |
| Rollback on error | Mock error, verify restoration |
