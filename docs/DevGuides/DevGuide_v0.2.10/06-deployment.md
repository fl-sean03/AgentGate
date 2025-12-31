# DevGuide v0.2.10: Deployment Hardening

## Thrust 9: Configurable Limits

### 9.1 Objective

Make concurrency and spawn limits configurable via environment variables.

### 9.2 Background

Currently, `maxConcurrentRuns` is hard-coded to 5 in the orchestrator. Users need to configure this for their hardware and workload.

### 9.3 Subtasks

#### 9.3.1 Add Environment Variable Reading

Update `packages/server/src/orchestrator/orchestrator.ts`:

Read from environment:
- `AGENTGATE_MAX_CONCURRENT_RUNS` → `maxConcurrentRuns` (default: 5)
- `AGENTGATE_MAX_SPAWN_DEPTH` → `spawnLimits.maxDepth` (default: 3)
- `AGENTGATE_MAX_CHILDREN_PER_PARENT` → `spawnLimits.maxChildrenPerParent` (default: 5)
- `AGENTGATE_MAX_TREE_SIZE` → `spawnLimits.maxTotalDescendants` (default: 20)

#### 9.3.2 Update Serve Command

Update `packages/server/src/control-plane/commands/serve.ts`:

- Log configured limits at startup
- Pass limits to orchestrator constructor

#### 9.3.3 Add Limits to Health Endpoint

Update health endpoint to return current limits:
```json
{
  "status": "healthy",
  "limits": {
    "maxConcurrentRuns": 10,
    "maxSpawnDepth": 3,
    "maxChildrenPerParent": 5,
    "maxTreeSize": 20
  }
}
```

### 9.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Start server with `AGENTGATE_MAX_CONCURRENT_RUNS=20`
3. Verify health endpoint shows correct limits
4. Verify logs show configured limits

### 9.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
| `packages/server/src/control-plane/commands/serve.ts` | Modified |
| `packages/server/src/server/routes/health.ts` | Modified |

---

## Thrust 10: Docker Compose

### 10.1 Objective

Create Docker Compose setup for one-command deployment.

### 10.2 Background

New developers should be able to:
1. Clone the repo
2. Copy `.env.example` to `.env` and add API keys
3. Run `docker-compose up`
4. Have a fully working AgentGate

### 10.3 Subtasks

#### 10.3.1 Create Server Dockerfile

Create `docker/Dockerfile.server`:

Multi-stage build:
1. **Builder stage**: Install pnpm, copy source, build packages
2. **Production stage**: Copy built artifacts, set up non-root user

Key requirements:
- Node.js 20 Alpine base
- Install git (for workspace operations)
- Create `/data/agentgate` for data persistence
- Run as non-root user
- Health check on `/health/ready`

#### 10.3.2 Create Dashboard Dockerfile

Create `docker/Dockerfile.dashboard`:

1. **Builder stage**: Build Vite React app
2. **Production stage**: Nginx serving static files

Include nginx.conf for:
- SPA routing (fallback to index.html)
- API proxy to server container
- WebSocket proxy support

#### 10.3.3 Create docker-compose.yml

Create `docker-compose.yml`:

**Services**:
- `server`: AgentGate server
  - Port 3001
  - Volume for data persistence
  - Environment variables from .env
  - Resource limits
  - Health check
- `dashboard`: React dashboard
  - Port 5173 (mapped to 80 in container)
  - Depends on server health

**Volumes**:
- `agentgate-data`: Persistent storage

**Networks**:
- `agentgate-network`: Internal communication

#### 10.3.4 Create .env.example

Create `.env.example` with documented variables:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
AGENTGATE_GITHUB_TOKEN=ghp_your-token-here

# Optional: Concurrency
AGENTGATE_MAX_CONCURRENT_RUNS=10

# Optional: Spawn Limits
AGENTGATE_MAX_SPAWN_DEPTH=3
AGENTGATE_MAX_CHILDREN_PER_PARENT=5
AGENTGATE_MAX_TREE_SIZE=20

# Optional: Ports
AGENTGATE_PORT=3001
DASHBOARD_PORT=5173

# Optional: Resource Limits
SERVER_MEMORY_LIMIT=4G
SERVER_CPU_LIMIT=4
```

#### 10.3.5 Create Setup Script

Create `scripts/docker-setup.sh`:

1. Check for docker and docker-compose
2. Copy .env.example to .env if not exists
3. Print instructions about adding API keys
4. Build images
5. Print usage instructions

#### 10.3.6 Create Nginx Config

Create `docker/nginx.conf`:

- Serve static files from /usr/share/nginx/html
- Health endpoint at /health
- Proxy /api/* to server:3001
- Proxy /ws to server:3001 (WebSocket)
- SPA fallback for client-side routing

### 10.4 Verification Steps

1. Run `docker-compose build` - should succeed
2. Run `docker-compose up -d` - containers start
3. Check `http://localhost:3001/health` - server healthy
4. Check `http://localhost:5173` - dashboard loads
5. Run `docker-compose logs server` - no errors
6. Submit test work order via CLI - executes correctly

### 10.5 Files Created

| File | Action |
|------|--------|
| `docker/Dockerfile.server` | Created |
| `docker/Dockerfile.dashboard` | Created |
| `docker/nginx.conf` | Created |
| `docker-compose.yml` | Created |
| `docker-compose.dev.yml` | Created |
| `.env.example` | Created |
| `scripts/docker-setup.sh` | Created |
