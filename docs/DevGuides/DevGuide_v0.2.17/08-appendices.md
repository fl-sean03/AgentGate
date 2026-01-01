# 08: Appendices

Checklists, troubleshooting guides, and quick references for DevGuide v0.2.17.

---

## Implementation Checklist

### Thrust 1: Extended Work Order Schema
- [ ] Update `createWorkOrderBodySchema` with harness options
- [ ] Create `apiHarnessOptionsSchema` in api.ts
- [ ] Implement `mapApiHarnessToConfig()` function
- [ ] Update POST /work-orders handler to use harness config
- [ ] Add harness info to GET /work-orders/:id response
- [ ] Update work order response types
- [ ] Add validation error messages for harness options
- [ ] Write unit tests for new schemas
- [ ] Write integration tests for extended submission
- [ ] Verify backwards compatibility

### Thrust 2: Profile CRUD API
- [ ] Create `packages/server/src/server/types/profiles.ts`
- [ ] Create `packages/server/src/server/routes/profiles.ts`
- [ ] Implement `GET /api/v1/profiles`
- [ ] Implement `GET /api/v1/profiles/:name`
- [ ] Implement `POST /api/v1/profiles`
- [ ] Implement `PUT /api/v1/profiles/:name`
- [ ] Implement `DELETE /api/v1/profiles/:name`
- [ ] Implement `POST /api/v1/profiles/:name/validate`
- [ ] Add authentication to mutating endpoints
- [ ] Register routes in server
- [ ] Write unit tests for profile operations
- [ ] Write integration tests

### Thrust 3: Audit Trail API
- [ ] Create `packages/server/src/server/types/audit.ts`
- [ ] Create `packages/server/src/server/routes/audit.ts`
- [ ] Implement `GET /api/v1/audit/runs/:runId`
- [ ] Implement `GET /api/v1/audit/runs/:runId/snapshots`
- [ ] Implement `GET /api/v1/audit/runs/:runId/changes`
- [ ] Implement `GET /api/v1/work-orders/:id/audit`
- [ ] Create helper functions for snapshot mapping
- [ ] Register routes in server
- [ ] Write unit tests
- [ ] Write integration tests

### Thrust 4: Run Streaming API
- [ ] Create `packages/server/src/server/types/stream.ts`
- [ ] Create `packages/server/src/server/stream/stream-manager.ts`
- [ ] Create `packages/server/src/server/routes/stream.ts`
- [ ] Implement `GET /api/v1/runs/:id/stream` SSE endpoint
- [ ] Implement `GET /api/v1/work-orders/:id/stream` SSE endpoint
- [ ] Implement `GET /api/v1/runs/:id/config`
- [ ] Implement `GET /api/v1/runs/:id/strategy-state`
- [ ] Add event emission to run executor
- [ ] Add heartbeat mechanism
- [ ] Handle client disconnections
- [ ] Register routes in server
- [ ] Write unit tests
- [ ] Write integration tests with mock SSE client

### Thrust 5: API Documentation
- [ ] Add `@fastify/swagger` and `@fastify/swagger-ui` dependencies
- [ ] Create `packages/server/src/server/openapi.ts`
- [ ] Add OpenAPI schemas to all route handlers
- [ ] Create component schemas for reusable types
- [ ] Create `scripts/generate-openapi.ts`
- [ ] Add npm script for spec generation
- [ ] Generate `docs/api/openapi.json`
- [ ] Generate `docs/api/openapi.yaml`
- [ ] Register OpenAPI in server
- [ ] Verify Swagger UI works at /docs
- [ ] Validate generated spec

### Thrust 6: Client SDK
- [ ] Create `packages/client/` directory structure
- [ ] Create `packages/client/package.json`
- [ ] Create `packages/client/tsconfig.json`
- [ ] Create `packages/client/src/types.ts`
- [ ] Create `packages/client/src/errors.ts`
- [ ] Create `packages/client/src/stream.ts`
- [ ] Create `packages/client/src/client.ts`
- [ ] Create `packages/client/src/index.ts`
- [ ] Create `packages/client/README.md`
- [ ] Add to pnpm workspace
- [ ] Build package successfully
- [ ] Write unit tests
- [ ] Write integration tests against real API
- [ ] Test SSE streaming
- [ ] Prepare for npm publish

---

## File Reference

### New Files (18 files)

| Path | Thrust |
|------|--------|
| `packages/server/src/server/types/profiles.ts` | 2 |
| `packages/server/src/server/types/audit.ts` | 3 |
| `packages/server/src/server/types/stream.ts` | 4 |
| `packages/server/src/server/routes/profiles.ts` | 2 |
| `packages/server/src/server/routes/audit.ts` | 3 |
| `packages/server/src/server/routes/stream.ts` | 4 |
| `packages/server/src/server/stream/stream-manager.ts` | 4 |
| `packages/server/src/server/openapi.ts` | 5 |
| `packages/server/scripts/generate-openapi.ts` | 5 |
| `docs/api/openapi.json` | 5 |
| `docs/api/openapi.yaml` | 5 |
| `packages/client/package.json` | 6 |
| `packages/client/tsconfig.json` | 6 |
| `packages/client/src/index.ts` | 6 |
| `packages/client/src/client.ts` | 6 |
| `packages/client/src/types.ts` | 6 |
| `packages/client/src/errors.ts` | 6 |
| `packages/client/src/stream.ts` | 6 |

### Modified Files (7 files)

| Path | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/server/types/api.ts` | 1 | Add harness schemas |
| `packages/server/src/server/routes/work-orders.ts` | 1, 3 | Extended submission, audit endpoint |
| `packages/server/src/server/routes/runs.ts` | 4 | Config and state endpoints |
| `packages/server/src/server/index.ts` | 2-5 | Register new routes, OpenAPI |
| `packages/server/src/orchestrator/run-executor.ts` | 4 | Emit stream events |
| `packages/server/package.json` | 5 | Add swagger dependencies |
| `pnpm-workspace.yaml` | 6 | Add client package |

---

## Troubleshooting Guide

### Profile Not Found via API

**Symptom:** `GET /api/v1/profiles/xyz` returns 404

**Solutions:**
1. Verify profile exists: `GET /api/v1/profiles` to list all
2. Check profile name spelling (case-sensitive)
3. Ensure profile file exists in `~/.agentgate/harnesses/`
4. Check server has read access to harness directory

### SSE Stream Disconnects

**Symptom:** Stream connection drops unexpectedly

**Solutions:**
1. Check for proxy/load balancer buffering (set `X-Accel-Buffering: no`)
2. Verify heartbeat is being sent (every 30s)
3. Check server logs for errors
4. Increase client timeout if using custom fetch
5. Verify run is still active (not completed)

### Harness Config Validation Fails

**Symptom:** `POST /api/v1/work-orders` returns 400 with harness error

**Solutions:**
1. Check error details for specific field
2. Verify profile exists if using `profile` option
3. Ensure loopStrategy mode matches strategy-specific options
4. Validate numbers are within allowed ranges

### Audit Record Not Found

**Symptom:** `GET /api/v1/audit/runs/:runId` returns 404

**Solutions:**
1. Verify run ID is correct
2. Check run has actually started (not just queued)
3. Ensure audit trail is enabled in server config
4. Check `~/.agentgate/audit/runs/` directory exists

### Client SDK Network Errors

**Symptom:** Client throws `NetworkError`

**Solutions:**
1. Verify server is running and reachable
2. Check baseUrl includes protocol (http/https)
3. Verify API key if required for endpoint
4. Check for CORS issues if running in browser
5. Increase timeout if requests are slow

### OpenAPI Spec Generation Fails

**Symptom:** `pnpm run openapi:generate` errors

**Solutions:**
1. Ensure all route schemas are valid
2. Check for circular references in schemas
3. Verify all $ref paths are correct
4. Run `pnpm typecheck` first

---

## Quick Reference

### API Endpoints Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/work-orders` | No | List work orders |
| POST | `/api/v1/work-orders` | Yes | Create work order |
| GET | `/api/v1/work-orders/:id` | No | Get work order |
| DELETE | `/api/v1/work-orders/:id` | Yes | Cancel work order |
| GET | `/api/v1/work-orders/:id/audit` | No | Get work order audit |
| GET | `/api/v1/work-orders/:id/stream` | No | Stream work order events |
| GET | `/api/v1/runs` | No | List runs |
| GET | `/api/v1/runs/:id` | No | Get run |
| GET | `/api/v1/runs/:id/config` | No | Get run config |
| GET | `/api/v1/runs/:id/strategy-state` | No | Get strategy state |
| GET | `/api/v1/runs/:id/stream` | No | Stream run events |
| GET | `/api/v1/profiles` | No | List profiles |
| POST | `/api/v1/profiles` | Yes | Create profile |
| GET | `/api/v1/profiles/:name` | No | Get profile |
| PUT | `/api/v1/profiles/:name` | Yes | Update profile |
| DELETE | `/api/v1/profiles/:name` | Yes | Delete profile |
| POST | `/api/v1/profiles/:name/validate` | No | Validate profile |
| GET | `/api/v1/audit/runs/:runId` | No | Get audit record |
| GET | `/api/v1/audit/runs/:runId/snapshots` | No | Get snapshots |
| GET | `/api/v1/audit/runs/:runId/changes` | No | Get changes |

### SSE Event Types

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `connected` | Connection established | clientId, runStatus |
| `run-start` | Run beginning | workOrderId, config |
| `iteration-start` | Iteration beginning | iteration, maxIterations |
| `agent-output` | Agent output chunk | iteration, chunk, isComplete |
| `verification-start` | Verification starting | iteration, level |
| `verification-complete` | Verification done | iteration, level, passed |
| `ci-start` | CI polling starting | iteration, prUrl |
| `ci-complete` | CI finished | iteration, passed |
| `iteration-complete` | Iteration done | iteration, decision |
| `run-complete` | Run finished | status, totalIterations, prUrl |
| `error` | Error occurred | code, message, recoverable |
| `heartbeat` | Keep-alive | serverTime |

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / Validation error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict |
| 500 | Internal error |

### Error Codes

| Code | Description |
|------|-------------|
| `BAD_REQUEST` | Invalid request data |
| `UNAUTHORIZED` | Missing or invalid API key |
| `FORBIDDEN` | Action not allowed |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource state conflict |
| `INTERNAL_ERROR` | Server error |
| `PROFILE_NOT_FOUND` | Profile doesn't exist |
| `PROFILE_EXISTS` | Profile already exists |
| `PROFILE_INVALID` | Profile validation failed |
| `HARNESS_INVALID` | Harness config validation failed |
| `AUDIT_NOT_FOUND` | Audit record not found |
| `STREAM_ERROR` | SSE stream error |

---

## Sources & References

### Related DevGuides

- [v0.2.16](../DevGuide_v0.2.16/00-index.md) - Harness Configuration (prerequisite)
- [v0.2.15](../DevGuide_v0.2.15/00-index.md) - CI/CD System
- [v0.2.10](../DevGuide_v0.2.10/00-index.md) - Initial API

### External Documentation

- [Fastify](https://fastify.io/) - Web framework
- [Fastify Swagger](https://github.com/fastify/fastify-swagger) - OpenAPI plugin
- [Zod](https://zod.dev/) - Schema validation
- [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3) - API specification
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource](https://www.npmjs.com/package/eventsource) - Node.js SSE client

### Internal References

- `packages/server/src/server/routes/work-orders.ts` - Work order routes
- `packages/server/src/server/routes/runs.ts` - Run routes
- `packages/server/src/harness/config-loader.ts` - Profile loading
- `packages/server/src/harness/config-resolver.ts` - Config resolution
- `packages/server/src/harness/audit-trail.ts` - Audit system

---

## Testing Commands

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm test --filter=server -- --grep="api"

# Run client SDK tests
pnpm test --filter=client

# Generate OpenAPI spec
pnpm --filter=server run openapi:generate

# Validate OpenAPI spec
npx @redocly/cli lint docs/api/openapi.yaml

# Build client SDK
pnpm --filter=client run build

# Test SSE endpoint manually
curl -N http://localhost:3000/api/v1/runs/run-123/stream
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.2.17 | TBD | Comprehensive API Extension |
| v0.2.16 | TBD | Harness Configuration System |
| v0.2.15 | TBD | Production-Grade CI/CD |
