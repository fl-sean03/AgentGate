# DevGuide v0.2.10: Deployment Hardening & Container Sandboxing

## Overview

Thrusts 9-10 provide the infrastructure for:
1. **Configurable resource limits** - Environment-based configuration for concurrency, spawning, and timeouts
2. **Docker-based sandboxing** - Container isolation for each agent execution

### Why Container Sandboxing?

Currently, agents run directly on the host filesystem with full access to:
- All files outside the workspace
- System binaries and tools
- Network (unless restricted)
- Other running processes

**Docker containers provide**:
- Filesystem isolation (agent only sees mounted workspace)
- Network isolation (configurable)
- Resource limits (CPU, memory)
- Process isolation (no visibility into host processes)
- Reproducible environments

---

## Thrust 9: Configurable Limits

### 9.1 Objective

Make all operational limits configurable via environment variables, enabling:
- Production deployments with higher concurrency
- Development environments with lower resource usage
- Fine-tuned spawn limits per deployment

### 9.2 Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENTGATE_MAX_CONCURRENT_RUNS` | int | 5 | Maximum runs executing simultaneously |
| `AGENTGATE_MAX_SPAWN_DEPTH` | int | 3 | Maximum nesting depth for spawned agents |
| `AGENTGATE_MAX_CHILDREN_PER_PARENT` | int | 10 | Maximum children per work order |
| `AGENTGATE_MAX_TREE_SIZE` | int | 100 | Maximum total work orders in a tree |
| `AGENTGATE_DEFAULT_TIMEOUT_SECONDS` | int | 3600 | Default timeout for runs (1 hour) |
| `AGENTGATE_POLL_INTERVAL_MS` | int | 5000 | Orchestrator polling interval |
| `AGENTGATE_LEASE_DURATION_SECONDS` | int | 3600 | Workspace lease duration |
| `AGENTGATE_DATA_DIR` | string | `.agentgate/data` | Data persistence directory |

### 9.3 Implementation Details

#### 9.3.1 Create Configuration Module

**New File**: `packages/server/src/config/index.ts`

```typescript
/**
 * AgentGate Configuration Module
 *
 * Centralizes all configuration reading from environment variables
 * with validation and defaults.
 */

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const log = createLogger('config');

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Concurrency limits
  maxConcurrentRuns: z.coerce.number().int().min(1).max(100).default(5),

  // Spawn limits
  maxSpawnDepth: z.coerce.number().int().min(1).max(10).default(3),
  maxChildrenPerParent: z.coerce.number().int().min(1).max(50).default(10),
  maxTreeSize: z.coerce.number().int().min(1).max(1000).default(100),

  // Timeouts
  defaultTimeoutSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  pollIntervalMs: z.coerce.number().int().min(1000).max(60000).default(5000),
  leaseDurationSeconds: z.coerce.number().int().min(300).max(86400).default(3600),

  // Paths
  dataDir: z.string().default('.agentgate/data'),

  // Server
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default('0.0.0.0'),
});

export type AgentGateConfig = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AgentGateConfig {
  const raw = {
    maxConcurrentRuns: process.env.AGENTGATE_MAX_CONCURRENT_RUNS,
    maxSpawnDepth: process.env.AGENTGATE_MAX_SPAWN_DEPTH,
    maxChildrenPerParent: process.env.AGENTGATE_MAX_CHILDREN_PER_PARENT,
    maxTreeSize: process.env.AGENTGATE_MAX_TREE_SIZE,
    defaultTimeoutSeconds: process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS,
    pollIntervalMs: process.env.AGENTGATE_POLL_INTERVAL_MS,
    leaseDurationSeconds: process.env.AGENTGATE_LEASE_DURATION_SECONDS,
    dataDir: process.env.AGENTGATE_DATA_DIR,
    port: process.env.AGENTGATE_PORT,
    host: process.env.AGENTGATE_HOST,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    log.error({ errors: result.error.errors }, 'Invalid configuration');
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  log.info(
    {
      maxConcurrentRuns: result.data.maxConcurrentRuns,
      maxSpawnDepth: result.data.maxSpawnDepth,
      maxChildrenPerParent: result.data.maxChildrenPerParent,
      maxTreeSize: result.data.maxTreeSize,
    },
    'Configuration loaded'
  );

  return result.data;
}

/**
 * Singleton configuration instance
 */
let configInstance: AgentGateConfig | null = null;

export function getConfig(): AgentGateConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}
```

#### 9.3.2 Update Orchestrator Constructor

**Modify**: `packages/server/src/orchestrator/orchestrator.ts`

```typescript
import { getConfig } from '../config/index.js';

export class Orchestrator {
  private config: Required<OrchestratorConfig>;
  private activeRuns: Map<string, Run> = new Map();

  constructor(config: OrchestratorConfig = {}) {
    const globalConfig = getConfig();

    this.config = {
      maxConcurrentRuns: config.maxConcurrentRuns ?? globalConfig.maxConcurrentRuns,
      defaultTimeoutSeconds: config.defaultTimeoutSeconds ?? globalConfig.defaultTimeoutSeconds,
      spawnLimits: config.spawnLimits ?? {
        maxDepth: globalConfig.maxSpawnDepth,
        maxChildren: globalConfig.maxChildrenPerParent,
        maxTotalDescendants: globalConfig.maxTreeSize,
      },
      enableSpawning: config.enableSpawning ?? true,
    };

    log.info(
      {
        maxConcurrentRuns: this.config.maxConcurrentRuns,
        defaultTimeoutSeconds: this.config.defaultTimeoutSeconds,
        spawnLimits: this.config.spawnLimits,
      },
      'Orchestrator initialized with configuration'
    );
  }

  /**
   * Get current configuration (for health endpoint)
   */
  getConfiguration(): Required<OrchestratorConfig> {
    return { ...this.config };
  }

  /**
   * Get current stats (for health endpoint)
   */
  getStats(): { activeRuns: number; maxConcurrentRuns: number } {
    return {
      activeRuns: this.activeRuns.size,
      maxConcurrentRuns: this.config.maxConcurrentRuns,
    };
  }
}
```

#### 9.3.3 Update Serve Command

**Modify**: `packages/server/src/control-plane/commands/serve.ts`

Add configuration logging at startup:

```typescript
import { getConfig } from '../../config/index.js';

async function executeServe(rawOptions: Record<string, unknown>): Promise<void> {
  // ... existing validation ...

  const config = getConfig();

  print(`Starting AgentGate server...`);
  print('');
  print(`${bold('Server Configuration:')}`);
  print(`  ${bold('Port:')} ${cyan(String(options.port))}`);
  print(`  ${bold('Host:')} ${cyan(options.host)}`);
  print(`  ${bold('CORS Origins:')} ${cyan(corsOrigins.join(', '))}`);
  print(`  ${bold('API Key:')} ${cyan(options.apiKey ? '(configured)' : '(none - auth disabled)')}`);
  print('');
  print(`${bold('Limits Configuration:')}`);
  print(`  ${bold('Max Concurrent Runs:')} ${cyan(String(config.maxConcurrentRuns))}`);
  print(`  ${bold('Max Spawn Depth:')} ${cyan(String(config.maxSpawnDepth))}`);
  print(`  ${bold('Max Children/Parent:')} ${cyan(String(config.maxChildrenPerParent))}`);
  print(`  ${bold('Max Tree Size:')} ${cyan(String(config.maxTreeSize))}`);
  print(`  ${bold('Default Timeout:')} ${cyan(String(config.defaultTimeoutSeconds) + 's')}`);
  print('');

  // ... rest of serve command ...
}
```

#### 9.3.4 Update Health Endpoint

**Modify**: `packages/server/src/server/routes/health.ts`

```typescript
import { getConfig } from '../../config/index.js';

// Add to health response
app.get('/health', async (_request, reply) => {
  const config = getConfig();

  return reply.send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? 'unknown',
    limits: {
      maxConcurrentRuns: config.maxConcurrentRuns,
      maxSpawnDepth: config.maxSpawnDepth,
      maxChildrenPerParent: config.maxChildrenPerParent,
      maxTreeSize: config.maxTreeSize,
      defaultTimeoutSeconds: config.defaultTimeoutSeconds,
    },
  });
});
```

### 9.4 Test Plan

#### Unit Tests

**New File**: `packages/server/test/config.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resetConfig } from '../src/config/index.js';

describe('Configuration', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.AGENTGATE_MAX_CONCURRENT_RUNS;
    delete process.env.AGENTGATE_MAX_SPAWN_DEPTH;
    resetConfig();
  });

  it('should load defaults when no env vars set', () => {
    const config = loadConfig();
    expect(config.maxConcurrentRuns).toBe(5);
    expect(config.maxSpawnDepth).toBe(3);
  });

  it('should read env vars correctly', () => {
    process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '20';
    process.env.AGENTGATE_MAX_SPAWN_DEPTH = '5';

    const config = loadConfig();
    expect(config.maxConcurrentRuns).toBe(20);
    expect(config.maxSpawnDepth).toBe(5);
  });

  it('should reject invalid values', () => {
    process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '0'; // Below minimum
    expect(() => loadConfig()).toThrow();
  });
});
```

### 9.5 Files Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/config/index.ts` | **Create** | Configuration module with Zod validation |
| `packages/server/src/orchestrator/orchestrator.ts` | Modify | Use config module, add getConfiguration/getStats |
| `packages/server/src/control-plane/commands/serve.ts` | Modify | Log configuration at startup |
| `packages/server/src/server/routes/health.ts` | Modify | Include limits in health response |
| `packages/server/test/config.test.ts` | **Create** | Configuration unit tests |

---

## Thrust 10: Docker Compose & Container Sandboxing

### 10.1 Objective

Create a complete Docker-based deployment that:
1. Runs the AgentGate server in a container
2. Provides workspace sandboxing for agent execution
3. Enables one-command deployment with `docker-compose up`
4. Supports scaling to 10-50+ concurrent agents

### 10.2 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Host Machine                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Docker Network (agentgate)                   │ │
│  │                                                                 │ │
│  │  ┌───────────────────────┐    ┌───────────────────────┐        │ │
│  │  │   AgentGate Server    │    │      Dashboard        │        │ │
│  │  │   (Node.js + Claude)  │    │      (Nginx + Vite)   │        │ │
│  │  │                       │    │                       │        │ │
│  │  │   Port: 3001          │◄──►│   Port: 80            │        │ │
│  │  │                       │    │                       │        │ │
│  │  │   Volumes:            │    │   - /api → server     │        │ │
│  │  │   - /data (persist)   │    │   - /ws → server      │        │ │
│  │  │   - /workspaces       │    │                       │        │ │
│  │  └───────────────────────┘    └───────────────────────┘        │ │
│  │            │                                                    │ │
│  │            ▼                                                    │ │
│  │  ┌───────────────────────────────────────────────────────────┐ │ │
│  │  │              Agent Execution Containers                    │ │ │
│  │  │  (Spawned per work order, isolated workspaces)            │ │ │
│  │  │                                                           │ │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │ │ │
│  │  │  │ Agent WO-1  │ │ Agent WO-2  │ │ Agent WO-N  │         │ │ │
│  │  │  │ /workspace  │ │ /workspace  │ │ /workspace  │         │ │ │
│  │  │  │ (isolated)  │ │ (isolated)  │ │ (isolated)  │         │ │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘         │ │ │
│  │  └───────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Persistent Volumes:                                                 │
│  - agentgate-data: Work order state, run history                    │
│  - agentgate-workspaces: Cloned repositories                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.3 Container Sandboxing Strategy

#### 10.3.1 Isolation Levels

| Component | Isolation Method | What's Isolated |
|-----------|-----------------|-----------------|
| Filesystem | Volume mounts | Only workspace dir visible |
| Network | Docker network | Inter-container only (optional) |
| Processes | Container boundary | No host process visibility |
| Resources | cgroups | CPU/memory limits per container |
| Users | Non-root user | Limited system access |

#### 10.3.2 Agent Execution Flow

```
1. Work order submitted
   └── Server receives request

2. Workspace preparation
   ├── Clone/create workspace in /workspaces/{wo-id}/
   ├── Create isolated volume for workspace
   └── Set up git branch

3. Agent container spawned (Docker-in-Docker or sibling)
   ├── Mount: /workspaces/{wo-id}/ → /workspace (read-write)
   ├── Mount: /tmp/{wo-id}/ → /tmp (ephemeral)
   ├── Environment: ANTHROPIC_API_KEY, work order context
   ├── Network: restricted (configurable)
   └── Resources: CPU/memory limits

4. Agent executes
   ├── Can only see /workspace and /tmp
   ├── Cannot access host filesystem
   ├── Cannot see other agent containers
   └── Network restricted to API calls only

5. Cleanup
   ├── Container removed
   ├── /tmp volume removed
   └── Workspace preserved (for results)
```

### 10.4 File Specifications

#### 10.4.1 Server Dockerfile

**File**: `docker/Dockerfile.server`

```dockerfile
# =============================================================================
# AgentGate Server Dockerfile
# Multi-stage build for production deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# Installs dependencies and builds TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY tsconfig.json ./

# Build all packages
RUN pnpm build

# Prune dev dependencies for production
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Stage 2: Production
# Minimal runtime image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    git \
    openssh-client \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 agentgate && \
    adduser -u 1001 -G agentgate -s /bin/sh -D agentgate

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=agentgate:agentgate /app/node_modules ./node_modules
COPY --from=builder --chown=agentgate:agentgate /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=agentgate:agentgate /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=agentgate:agentgate /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=agentgate:agentgate /app/packages/server/package.json ./packages/server/
COPY --from=builder --chown=agentgate:agentgate /app/package.json ./

# Create data and workspace directories
RUN mkdir -p /data/agentgate /workspaces && \
    chown -R agentgate:agentgate /data /workspaces

# Set environment
ENV NODE_ENV=production
ENV AGENTGATE_DATA_DIR=/data/agentgate

# Switch to non-root user
USER agentgate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health/ready || exit 1

# Start server
CMD ["node", "packages/server/dist/index.js", "serve"]
```

#### 10.4.2 Dashboard Dockerfile

**File**: `docker/Dockerfile.dashboard`

```dockerfile
# =============================================================================
# AgentGate Dashboard Dockerfile
# Vite React app served by Nginx
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# Build the Vite React application
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY packages/dashboard/ ./packages/dashboard/
COPY tsconfig.json ./

# Build shared first, then dashboard
RUN pnpm --filter @agentgate/shared build && \
    pnpm --filter @agentgate/dashboard build

# -----------------------------------------------------------------------------
# Stage 2: Production
# Nginx serving static files
# -----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Copy built static files
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Create nginx user permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

#### 10.4.3 Nginx Configuration

**File**: `docker/nginx.conf`

```nginx
# =============================================================================
# AgentGate Dashboard Nginx Configuration
# =============================================================================

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging format
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # Performance settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/rss+xml application/atom+xml image/svg+xml;

    # Upstream for API server
    upstream agentgate_server {
        server server:3001;
        keepalive 32;
    }

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Health check endpoint (for container health)
        location /health {
            access_log off;
            return 200 '{"status":"ok"}';
            add_header Content-Type application/json;
        }

        # API proxy
        location /api/ {
            proxy_pass http://agentgate_server;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts for long-running requests
            proxy_connect_timeout 60s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
        }

        # WebSocket proxy
        location /ws {
            proxy_pass http://agentgate_server;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;

            # WebSocket specific timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 3600s;
            proxy_read_timeout 3600s;
        }

        # Static files with caching
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # SPA fallback - serve index.html for client-side routing
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

#### 10.4.4 Docker Compose

**File**: `docker-compose.yml`

```yaml
# =============================================================================
# AgentGate Docker Compose Configuration
#
# Usage:
#   1. Copy .env.example to .env and configure
#   2. Run: docker-compose up -d
#   3. Access dashboard at http://localhost:5173
#   4. API available at http://localhost:3001
# =============================================================================

version: '3.8'

services:
  # ---------------------------------------------------------------------------
  # AgentGate Server
  # Main orchestration server
  # ---------------------------------------------------------------------------
  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    container_name: agentgate-server
    restart: unless-stopped

    ports:
      - "${AGENTGATE_PORT:-3001}:3001"

    environment:
      # Required
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${AGENTGATE_GITHUB_TOKEN:-${GITHUB_TOKEN}}

      # Concurrency limits
      - AGENTGATE_MAX_CONCURRENT_RUNS=${AGENTGATE_MAX_CONCURRENT_RUNS:-10}

      # Spawn limits
      - AGENTGATE_MAX_SPAWN_DEPTH=${AGENTGATE_MAX_SPAWN_DEPTH:-3}
      - AGENTGATE_MAX_CHILDREN_PER_PARENT=${AGENTGATE_MAX_CHILDREN_PER_PARENT:-10}
      - AGENTGATE_MAX_TREE_SIZE=${AGENTGATE_MAX_TREE_SIZE:-100}

      # Timeouts
      - AGENTGATE_DEFAULT_TIMEOUT_SECONDS=${AGENTGATE_DEFAULT_TIMEOUT_SECONDS:-3600}

      # Paths
      - AGENTGATE_DATA_DIR=/data/agentgate

      # Server config
      - NODE_ENV=production

    volumes:
      # Persistent data
      - agentgate-data:/data/agentgate

      # Workspace directory for git operations
      - agentgate-workspaces:/workspaces

      # Optional: Mount Docker socket for spawning agent containers
      # WARNING: This gives the container access to Docker daemon
      # Only enable if you need container-based agent isolation
      # - /var/run/docker.sock:/var/run/docker.sock

    networks:
      - agentgate

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '${SERVER_CPU_LIMIT:-4}'
          memory: ${SERVER_MEMORY_LIMIT:-4G}
        reservations:
          cpus: '1'
          memory: 1G

    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"

  # ---------------------------------------------------------------------------
  # AgentGate Dashboard
  # React web interface
  # ---------------------------------------------------------------------------
  dashboard:
    build:
      context: .
      dockerfile: docker/Dockerfile.dashboard
    container_name: agentgate-dashboard
    restart: unless-stopped

    ports:
      - "${DASHBOARD_PORT:-5173}:80"

    depends_on:
      server:
        condition: service_healthy

    networks:
      - agentgate

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

# -----------------------------------------------------------------------------
# Networks
# -----------------------------------------------------------------------------
networks:
  agentgate:
    driver: bridge
    name: agentgate-network

# -----------------------------------------------------------------------------
# Volumes
# -----------------------------------------------------------------------------
volumes:
  agentgate-data:
    name: agentgate-data
  agentgate-workspaces:
    name: agentgate-workspaces
```

#### 10.4.5 Development Docker Compose

**File**: `docker-compose.dev.yml`

```yaml
# =============================================================================
# AgentGate Docker Compose - Development Override
#
# Usage: docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
# =============================================================================

version: '3.8'

services:
  server:
    build:
      target: builder  # Use builder stage for dev

    environment:
      - NODE_ENV=development
      - AGENTGATE_MAX_CONCURRENT_RUNS=3
      - LOG_LEVEL=debug

    volumes:
      # Mount source for hot reload
      - ./packages/server/src:/app/packages/server/src:ro
      - ./packages/shared/src:/app/packages/shared/src:ro

    command: ["pnpm", "--filter", "@agentgate/server", "dev"]

    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  dashboard:
    build:
      target: builder

    volumes:
      - ./packages/dashboard/src:/app/packages/dashboard/src:ro

    command: ["pnpm", "--filter", "@agentgate/dashboard", "dev", "--host"]

    ports:
      - "5173:5173"
```

#### 10.4.6 Environment Example

**File**: `.env.example`

```bash
# =============================================================================
# AgentGate Environment Configuration
#
# Copy this file to .env and fill in your values:
#   cp .env.example .env
# =============================================================================

# -----------------------------------------------------------------------------
# REQUIRED: API Keys
# -----------------------------------------------------------------------------

# Anthropic API key for Claude Code agent
# Get yours at: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# GitHub token for repository operations
# Create a PAT at: https://github.com/settings/tokens
# Required scopes: repo, workflow
AGENTGATE_GITHUB_TOKEN=ghp_your-token-here

# Alternative: Use GITHUB_TOKEN if already set
# GITHUB_TOKEN=ghp_your-token-here

# -----------------------------------------------------------------------------
# OPTIONAL: Concurrency & Limits
# -----------------------------------------------------------------------------

# Maximum number of work orders executing simultaneously
# Higher = more parallelism, more resource usage
# Default: 10, Range: 1-100
AGENTGATE_MAX_CONCURRENT_RUNS=10

# Maximum depth for recursive agent spawning
# Prevents infinite spawn loops
# Default: 3, Range: 1-10
AGENTGATE_MAX_SPAWN_DEPTH=3

# Maximum children a single work order can spawn
# Default: 10, Range: 1-50
AGENTGATE_MAX_CHILDREN_PER_PARENT=10

# Maximum total work orders in a spawn tree
# Default: 100, Range: 1-1000
AGENTGATE_MAX_TREE_SIZE=100

# -----------------------------------------------------------------------------
# OPTIONAL: Timeouts
# -----------------------------------------------------------------------------

# Default timeout for agent runs (seconds)
# Default: 3600 (1 hour), Range: 60-86400
AGENTGATE_DEFAULT_TIMEOUT_SECONDS=3600

# -----------------------------------------------------------------------------
# OPTIONAL: Network Ports
# -----------------------------------------------------------------------------

# Server API port
# Default: 3001
AGENTGATE_PORT=3001

# Dashboard web interface port
# Default: 5173
DASHBOARD_PORT=5173

# -----------------------------------------------------------------------------
# OPTIONAL: Resource Limits (Docker)
# -----------------------------------------------------------------------------

# CPU limit for server container
# Default: 4
SERVER_CPU_LIMIT=4

# Memory limit for server container
# Default: 4G
SERVER_MEMORY_LIMIT=4G

# -----------------------------------------------------------------------------
# OPTIONAL: API Authentication
# -----------------------------------------------------------------------------

# API key for authenticating protected endpoints
# Leave empty to disable authentication (development only!)
# AGENTGATE_API_KEY=your-secret-api-key

# -----------------------------------------------------------------------------
# OPTIONAL: Logging
# -----------------------------------------------------------------------------

# Log level: trace, debug, info, warn, error
# Default: info
LOG_LEVEL=info
```

#### 10.4.7 Setup Script

**File**: `scripts/docker-setup.sh`

```bash
#!/bin/bash
# =============================================================================
# AgentGate Docker Setup Script
#
# This script helps you set up AgentGate with Docker
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   AgentGate Docker Setup                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo ""
    echo -e "${RED}IMPORTANT: You must configure your API keys in .env${NC}"
    echo ""
    echo "Required configuration:"
    echo "  1. ANTHROPIC_API_KEY - Get from https://console.anthropic.com/"
    echo "  2. AGENTGATE_GITHUB_TOKEN - Create at https://github.com/settings/tokens"
    echo ""
    echo "Open .env in your editor and add these values."
    echo ""
    read -p "Press Enter after you've configured .env, or Ctrl+C to exit..."
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Validate required env vars
echo ""
echo -e "${YELLOW}Validating configuration...${NC}"

source .env

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-api03-your-key-here" ]; then
    echo -e "${RED}Error: ANTHROPIC_API_KEY is not configured in .env${NC}"
    exit 1
fi
echo -e "${GREEN}✓ ANTHROPIC_API_KEY configured${NC}"

GITHUB_TOKEN_VAR="${AGENTGATE_GITHUB_TOKEN:-$GITHUB_TOKEN}"
if [ -z "$GITHUB_TOKEN_VAR" ] || [ "$GITHUB_TOKEN_VAR" = "ghp_your-token-here" ]; then
    echo -e "${YELLOW}Warning: GitHub token not configured${NC}"
    echo "  Some features (GitHub repos) will not work without it"
fi

# Build images
echo ""
echo -e "${YELLOW}Building Docker images...${NC}"
echo "This may take a few minutes on first run..."
echo ""

docker compose build

echo ""
echo -e "${GREEN}✓ Docker images built successfully${NC}"

# Print usage
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Setup Complete!                           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "To start AgentGate:"
echo -e "  ${GREEN}docker compose up -d${NC}"
echo ""
echo "To view logs:"
echo -e "  ${GREEN}docker compose logs -f${NC}"
echo ""
echo "To stop AgentGate:"
echo -e "  ${GREEN}docker compose down${NC}"
echo ""
echo "Access points:"
echo -e "  Dashboard: ${BLUE}http://localhost:${DASHBOARD_PORT:-5173}${NC}"
echo -e "  API:       ${BLUE}http://localhost:${AGENTGATE_PORT:-3001}${NC}"
echo -e "  Health:    ${BLUE}http://localhost:${AGENTGATE_PORT:-3001}/health${NC}"
echo ""
```

### 10.5 Test Plan

#### 10.5.1 Build Tests

```bash
# Build images
docker compose build

# Verify images created
docker images | grep agentgate
```

#### 10.5.2 Startup Tests

```bash
# Start services
docker compose up -d

# Check container health
docker compose ps

# Expected output:
# NAME                  STATUS                   PORTS
# agentgate-server      Up (healthy)             0.0.0.0:3001->3001/tcp
# agentgate-dashboard   Up (healthy)             0.0.0.0:5173->80/tcp
```

#### 10.5.3 Health Endpoint Tests

```bash
# Server health
curl http://localhost:3001/health
# Expected: {"status":"ok","limits":{...}}

# Dashboard health
curl http://localhost:5173/health
# Expected: {"status":"ok"}

# Readiness
curl http://localhost:3001/health/ready
# Expected: {"status":"ready"}
```

#### 10.5.4 API Proxy Tests

```bash
# List work orders via dashboard proxy
curl http://localhost:5173/api/v1/work-orders
# Expected: {"data":[],"pagination":{...}}
```

#### 10.5.5 Work Order Submission Test

```bash
# Submit a test work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "taskPrompt": "Create a hello world function",
    "workspaceSource": {
      "type": "fresh",
      "destPath": "/workspaces/test-$(date +%s)"
    }
  }'
```

### 10.6 Files Summary

| File | Action | Description |
|------|--------|-------------|
| `docker/Dockerfile.server` | **Create** | Multi-stage server build |
| `docker/Dockerfile.dashboard` | **Create** | Dashboard build with Nginx |
| `docker/nginx.conf` | **Create** | Nginx config with API proxy |
| `docker-compose.yml` | **Create** | Production compose file |
| `docker-compose.dev.yml` | **Create** | Development overrides |
| `.env.example` | **Create** | Environment template |
| `scripts/docker-setup.sh` | **Create** | Setup helper script |

---

## Extensive Testing & Validation

This section provides comprehensive test procedures to ensure all functionality works correctly.

### E2E Test: Configuration Module

**File**: `packages/server/test/config.test.ts`

```typescript
/**
 * Configuration Module Tests
 *
 * Comprehensive tests for environment variable loading and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig, getConfig, type AgentGateConfig } from '../src/config/index.js';

describe('Configuration Module', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
    // Clear all AGENTGATE_ env vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('AGENTGATE_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('loadConfig', () => {
    describe('defaults', () => {
      it('should return correct defaults when no env vars set', () => {
        const config = loadConfig();

        expect(config.maxConcurrentRuns).toBe(5);
        expect(config.maxSpawnDepth).toBe(3);
        expect(config.maxChildrenPerParent).toBe(10);
        expect(config.maxTreeSize).toBe(100);
        expect(config.defaultTimeoutSeconds).toBe(3600);
        expect(config.pollIntervalMs).toBe(5000);
        expect(config.leaseDurationSeconds).toBe(3600);
        expect(config.dataDir).toBe('.agentgate/data');
        expect(config.port).toBe(3001);
        expect(config.host).toBe('0.0.0.0');
      });
    });

    describe('environment variable parsing', () => {
      it('should parse AGENTGATE_MAX_CONCURRENT_RUNS', () => {
        process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '20';
        const config = loadConfig();
        expect(config.maxConcurrentRuns).toBe(20);
      });

      it('should parse AGENTGATE_MAX_SPAWN_DEPTH', () => {
        process.env.AGENTGATE_MAX_SPAWN_DEPTH = '5';
        const config = loadConfig();
        expect(config.maxSpawnDepth).toBe(5);
      });

      it('should parse AGENTGATE_MAX_CHILDREN_PER_PARENT', () => {
        process.env.AGENTGATE_MAX_CHILDREN_PER_PARENT = '25';
        const config = loadConfig();
        expect(config.maxChildrenPerParent).toBe(25);
      });

      it('should parse AGENTGATE_MAX_TREE_SIZE', () => {
        process.env.AGENTGATE_MAX_TREE_SIZE = '500';
        const config = loadConfig();
        expect(config.maxTreeSize).toBe(500);
      });

      it('should parse AGENTGATE_DEFAULT_TIMEOUT_SECONDS', () => {
        process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '7200';
        const config = loadConfig();
        expect(config.defaultTimeoutSeconds).toBe(7200);
      });

      it('should parse AGENTGATE_POLL_INTERVAL_MS', () => {
        process.env.AGENTGATE_POLL_INTERVAL_MS = '10000';
        const config = loadConfig();
        expect(config.pollIntervalMs).toBe(10000);
      });

      it('should parse AGENTGATE_DATA_DIR', () => {
        process.env.AGENTGATE_DATA_DIR = '/custom/data/path';
        const config = loadConfig();
        expect(config.dataDir).toBe('/custom/data/path');
      });

      it('should parse AGENTGATE_PORT', () => {
        process.env.AGENTGATE_PORT = '8080';
        const config = loadConfig();
        expect(config.port).toBe(8080);
      });

      it('should parse AGENTGATE_HOST', () => {
        process.env.AGENTGATE_HOST = '127.0.0.1';
        const config = loadConfig();
        expect(config.host).toBe('127.0.0.1');
      });

      it('should parse multiple env vars simultaneously', () => {
        process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '50';
        process.env.AGENTGATE_MAX_SPAWN_DEPTH = '7';
        process.env.AGENTGATE_PORT = '9000';

        const config = loadConfig();

        expect(config.maxConcurrentRuns).toBe(50);
        expect(config.maxSpawnDepth).toBe(7);
        expect(config.port).toBe(9000);
        // Other values should remain default
        expect(config.maxChildrenPerParent).toBe(10);
      });
    });

    describe('validation', () => {
      describe('maxConcurrentRuns', () => {
        it('should reject value below minimum (0)', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '0';
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (101)', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '101';
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary value (1)', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '1';
          const config = loadConfig();
          expect(config.maxConcurrentRuns).toBe(1);
        });

        it('should accept boundary value (100)', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '100';
          const config = loadConfig();
          expect(config.maxConcurrentRuns).toBe(100);
        });

        it('should reject non-numeric value', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = 'not-a-number';
          expect(() => loadConfig()).toThrow();
        });

        it('should reject float value', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '5.5';
          // Zod coerce will truncate to 5
          const config = loadConfig();
          expect(config.maxConcurrentRuns).toBe(5);
        });

        it('should reject negative value', () => {
          process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '-5';
          expect(() => loadConfig()).toThrow();
        });
      });

      describe('maxSpawnDepth', () => {
        it('should reject value below minimum (0)', () => {
          process.env.AGENTGATE_MAX_SPAWN_DEPTH = '0';
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (11)', () => {
          process.env.AGENTGATE_MAX_SPAWN_DEPTH = '11';
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1 and 10)', () => {
          process.env.AGENTGATE_MAX_SPAWN_DEPTH = '1';
          expect(loadConfig().maxSpawnDepth).toBe(1);

          resetConfig();
          process.env.AGENTGATE_MAX_SPAWN_DEPTH = '10';
          expect(loadConfig().maxSpawnDepth).toBe(10);
        });
      });

      describe('defaultTimeoutSeconds', () => {
        it('should reject value below minimum (59)', () => {
          process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '59';
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (86401)', () => {
          process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '86401';
          expect(() => loadConfig()).toThrow();
        });

        it('should accept minimum (60 = 1 minute)', () => {
          process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '60';
          const config = loadConfig();
          expect(config.defaultTimeoutSeconds).toBe(60);
        });

        it('should accept maximum (86400 = 24 hours)', () => {
          process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '86400';
          const config = loadConfig();
          expect(config.defaultTimeoutSeconds).toBe(86400);
        });
      });

      describe('port', () => {
        it('should reject port 0', () => {
          process.env.AGENTGATE_PORT = '0';
          expect(() => loadConfig()).toThrow();
        });

        it('should reject port above 65535', () => {
          process.env.AGENTGATE_PORT = '65536';
          expect(() => loadConfig()).toThrow();
        });

        it('should accept valid ports', () => {
          process.env.AGENTGATE_PORT = '80';
          expect(loadConfig().port).toBe(80);

          resetConfig();
          process.env.AGENTGATE_PORT = '443';
          expect(loadConfig().port).toBe(443);

          resetConfig();
          process.env.AGENTGATE_PORT = '65535';
          expect(loadConfig().port).toBe(65535);
        });
      });
    });

    describe('error messages', () => {
      it('should provide meaningful error for invalid maxConcurrentRuns', () => {
        process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '-1';
        expect(() => loadConfig()).toThrow(/validation/i);
      });
    });
  });

  describe('getConfig (singleton)', () => {
    it('should return cached config on subsequent calls', () => {
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('should reload after resetConfig', () => {
      const config1 = getConfig();
      expect(config1.maxConcurrentRuns).toBe(5);

      process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '99';
      // Still returns cached value
      expect(getConfig().maxConcurrentRuns).toBe(5);

      // Reset and reload
      resetConfig();
      const config2 = getConfig();
      expect(config2.maxConcurrentRuns).toBe(99);
    });
  });

  describe('resetConfig', () => {
    it('should clear cached configuration', () => {
      // Load initial config
      getConfig();

      // Change env
      process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '77';

      // Reset
      resetConfig();

      // Should load new value
      expect(getConfig().maxConcurrentRuns).toBe(77);
    });
  });
});
```

### E2E Test: Health Endpoint with Limits

**File**: `packages/server/test/health-limits.test.ts`

```typescript
/**
 * Health Endpoint Tests with Configuration Limits
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { resetConfig } from '../src/config/index.js';

describe('Health Endpoint with Limits', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Set test configuration
    process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '25';
    process.env.AGENTGATE_MAX_SPAWN_DEPTH = '5';
    process.env.AGENTGATE_MAX_CHILDREN_PER_PARENT = '15';
    process.env.AGENTGATE_MAX_TREE_SIZE = '200';
    process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS = '1800';

    resetConfig();

    // Create test app with health routes
    const { registerHealthRoutes } = await import('../src/server/routes/health.js');
    app = Fastify();
    await registerHealthRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    // Clean up
    delete process.env.AGENTGATE_MAX_CONCURRENT_RUNS;
    delete process.env.AGENTGATE_MAX_SPAWN_DEPTH;
    delete process.env.AGENTGATE_MAX_CHILDREN_PER_PARENT;
    delete process.env.AGENTGATE_MAX_TREE_SIZE;
    delete process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS;
    resetConfig();
  });

  describe('GET /health', () => {
    it('should include limits in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body.limits).toBeDefined();
      expect(body.limits.maxConcurrentRuns).toBe(25);
      expect(body.limits.maxSpawnDepth).toBe(5);
      expect(body.limits.maxChildrenPerParent).toBe(15);
      expect(body.limits.maxTreeSize).toBe(200);
      expect(body.limits.defaultTimeoutSeconds).toBe(1800);
    });

    it('should include timestamp in ISO format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = response.json();
      expect(body.timestamp).toBeDefined();
      expect(() => new Date(body.timestamp)).not.toThrow();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ready');
    });
  });

  describe('GET /health/live', () => {
    it('should return live status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('live');
    });
  });
});
```

### Docker Build Validation Script

**File**: `scripts/validate-docker-build.sh`

```bash
#!/bin/bash
# =============================================================================
# Docker Build Validation Script
#
# Validates that Docker images build correctly and containers start properly.
# Run this as part of CI or before deployment.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
TESTS_RUN=0

log_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${YELLOW}[TEST $TESTS_RUN]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC}"
}

log_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    ERRORS=$((ERRORS + 1))
}

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           Docker Build Validation Suite                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Test 1: Docker available
# =============================================================================
log_test "Docker daemon available"
if docker info > /dev/null 2>&1; then
    log_pass
else
    log_fail "Docker daemon not running"
    exit 1
fi

# =============================================================================
# Test 2: Docker Compose available
# =============================================================================
log_test "Docker Compose available"
if docker compose version > /dev/null 2>&1; then
    log_pass
else
    log_fail "Docker Compose not installed"
    exit 1
fi

# =============================================================================
# Test 3: Dockerfiles exist
# =============================================================================
log_test "Dockerfile.server exists"
if [ -f "docker/Dockerfile.server" ]; then
    log_pass
else
    log_fail "docker/Dockerfile.server not found"
fi

log_test "Dockerfile.dashboard exists"
if [ -f "docker/Dockerfile.dashboard" ]; then
    log_pass
else
    log_fail "docker/Dockerfile.dashboard not found"
fi

log_test "nginx.conf exists"
if [ -f "docker/nginx.conf" ]; then
    log_pass
else
    log_fail "docker/nginx.conf not found"
fi

log_test "docker-compose.yml exists"
if [ -f "docker-compose.yml" ]; then
    log_pass
else
    log_fail "docker-compose.yml not found"
fi

# =============================================================================
# Test 4: Build server image
# =============================================================================
log_test "Building server image"
if docker build -f docker/Dockerfile.server -t agentgate-server-test:latest . > /tmp/build-server.log 2>&1; then
    log_pass
else
    log_fail "Server build failed. See /tmp/build-server.log"
fi

# =============================================================================
# Test 5: Build dashboard image
# =============================================================================
log_test "Building dashboard image"
if docker build -f docker/Dockerfile.dashboard -t agentgate-dashboard-test:latest . > /tmp/build-dashboard.log 2>&1; then
    log_pass
else
    log_fail "Dashboard build failed. See /tmp/build-dashboard.log"
fi

# =============================================================================
# Test 6: Server image has correct user
# =============================================================================
log_test "Server image runs as non-root user"
USER=$(docker run --rm agentgate-server-test:latest whoami 2>/dev/null)
if [ "$USER" = "agentgate" ]; then
    log_pass
else
    log_fail "Expected user 'agentgate', got '$USER'"
fi

# =============================================================================
# Test 7: Server image has required binaries
# =============================================================================
log_test "Server image has git"
if docker run --rm agentgate-server-test:latest which git > /dev/null 2>&1; then
    log_pass
else
    log_fail "git not found in server image"
fi

log_test "Server image has curl"
if docker run --rm agentgate-server-test:latest which curl > /dev/null 2>&1; then
    log_pass
else
    log_fail "curl not found in server image"
fi

log_test "Server image has node"
if docker run --rm agentgate-server-test:latest which node > /dev/null 2>&1; then
    log_pass
else
    log_fail "node not found in server image"
fi

# =============================================================================
# Test 8: Server image has correct directories
# =============================================================================
log_test "Server image has /data/agentgate directory"
if docker run --rm agentgate-server-test:latest test -d /data/agentgate; then
    log_pass
else
    log_fail "/data/agentgate not found"
fi

log_test "Server image has /workspaces directory"
if docker run --rm agentgate-server-test:latest test -d /workspaces; then
    log_pass
else
    log_fail "/workspaces not found"
fi

# =============================================================================
# Test 9: Server starts and responds to health check
# =============================================================================
log_test "Server container starts and health check passes"
CONTAINER_ID=$(docker run -d -p 13001:3001 \
    -e ANTHROPIC_API_KEY=test-key \
    agentgate-server-test:latest)

sleep 5  # Wait for startup

if curl -sf http://localhost:13001/health > /dev/null 2>&1; then
    log_pass
else
    log_fail "Health check failed"
    docker logs $CONTAINER_ID
fi

docker stop $CONTAINER_ID > /dev/null 2>&1
docker rm $CONTAINER_ID > /dev/null 2>&1

# =============================================================================
# Test 10: Dashboard nginx configuration is valid
# =============================================================================
log_test "Dashboard nginx configuration is valid"
if docker run --rm agentgate-dashboard-test:latest nginx -t > /dev/null 2>&1; then
    log_pass
else
    log_fail "nginx configuration invalid"
fi

# =============================================================================
# Test 11: Docker Compose config is valid
# =============================================================================
log_test "docker-compose.yml is valid"
if docker compose config > /dev/null 2>&1; then
    log_pass
else
    log_fail "docker-compose.yml has syntax errors"
fi

# =============================================================================
# Test 12: Full stack starts with docker-compose
# =============================================================================
log_test "Full stack starts with docker-compose"

# Create test .env
cat > .env.test << EOF
ANTHROPIC_API_KEY=test-key-for-validation
AGENTGATE_GITHUB_TOKEN=test-token
AGENTGATE_PORT=13001
DASHBOARD_PORT=13080
AGENTGATE_MAX_CONCURRENT_RUNS=3
EOF

# Start stack
if docker compose --env-file .env.test up -d --build > /tmp/compose-up.log 2>&1; then
    sleep 10  # Wait for containers to be healthy

    # Check server health
    if curl -sf http://localhost:13001/health > /dev/null 2>&1; then
        # Check dashboard health
        if curl -sf http://localhost:13080/health > /dev/null 2>&1; then
            log_pass
        else
            log_fail "Dashboard health check failed"
        fi
    else
        log_fail "Server health check failed"
    fi

    # Cleanup
    docker compose --env-file .env.test down > /dev/null 2>&1
else
    log_fail "docker-compose up failed. See /tmp/compose-up.log"
fi

rm -f .env.test

# =============================================================================
# Cleanup test images
# =============================================================================
echo ""
echo "Cleaning up test images..."
docker rmi agentgate-server-test:latest > /dev/null 2>&1 || true
docker rmi agentgate-dashboard-test:latest > /dev/null 2>&1 || true

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                     Validation Summary                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Tests run: $TESTS_RUN"
echo "Passed:    $((TESTS_RUN - ERRORS))"
echo "Failed:    $ERRORS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS test(s) failed${NC}"
    exit 1
fi
```

### Integration Test: End-to-End Docker Workflow

**File**: `scripts/test-docker-e2e.sh`

```bash
#!/bin/bash
# =============================================================================
# End-to-End Docker Integration Test
#
# Tests the complete workflow:
# 1. Start containers
# 2. Submit work order via API
# 3. Monitor execution
# 4. Verify results
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           End-to-End Docker Integration Test                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for required env vars
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}Error: ANTHROPIC_API_KEY not set${NC}"
    echo "Set it with: export ANTHROPIC_API_KEY=your-key"
    exit 1
fi

# Create test environment file
cat > .env.e2e << EOF
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
AGENTGATE_GITHUB_TOKEN=${AGENTGATE_GITHUB_TOKEN:-$GITHUB_TOKEN}
AGENTGATE_PORT=14001
DASHBOARD_PORT=14080
AGENTGATE_MAX_CONCURRENT_RUNS=2
AGENTGATE_DEFAULT_TIMEOUT_SECONDS=300
EOF

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    docker compose --env-file .env.e2e down -v > /dev/null 2>&1 || true
    rm -f .env.e2e
}

trap cleanup EXIT

# =============================================================================
# Step 1: Start containers
# =============================================================================
echo -e "${YELLOW}Step 1: Starting containers...${NC}"
docker compose --env-file .env.e2e up -d --build

echo "Waiting for containers to be healthy..."
for i in {1..30}; do
    if curl -sf http://localhost:14001/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server is ready${NC}"
        break
    fi
    sleep 2
done

# =============================================================================
# Step 2: Verify health endpoints
# =============================================================================
echo ""
echo -e "${YELLOW}Step 2: Verifying health endpoints...${NC}"

echo -n "  Server /health: "
HEALTH=$(curl -sf http://localhost:14001/health)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL${NC}"
    exit 1
fi

echo -n "  Server /health has limits: "
if echo "$HEALTH" | grep -q '"maxConcurrentRuns":2'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL (limits not in response)${NC}"
    exit 1
fi

echo -n "  Dashboard /health: "
if curl -sf http://localhost:14080/health | grep -q '"status":"ok"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL${NC}"
    exit 1
fi

echo -n "  API proxy /api/v1/work-orders: "
if curl -sf http://localhost:14080/api/v1/work-orders | grep -q '"data"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL${NC}"
    exit 1
fi

# =============================================================================
# Step 3: Submit a test work order
# =============================================================================
echo ""
echo -e "${YELLOW}Step 3: Submitting test work order...${NC}"

RESPONSE=$(curl -sf -X POST http://localhost:14001/api/v1/work-orders \
    -H "Content-Type: application/json" \
    -d '{
        "taskPrompt": "Create a file called hello.txt with the contents Hello World",
        "workspaceSource": {
            "type": "fresh",
            "destPath": "/workspaces/e2e-test-'$(date +%s)'"
        },
        "maxIterations": 1,
        "maxWallClockSeconds": 120
    }')

WORK_ORDER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$WORK_ORDER_ID" ]; then
    echo -e "${RED}Failed to submit work order${NC}"
    echo "$RESPONSE"
    exit 1
fi

echo -e "  Work order ID: ${BLUE}$WORK_ORDER_ID${NC}"
echo -e "${GREEN}✓ Work order submitted${NC}"

# =============================================================================
# Step 4: Monitor work order status
# =============================================================================
echo ""
echo -e "${YELLOW}Step 4: Monitoring work order status...${NC}"

MAX_WAIT=120
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    STATUS_RESPONSE=$(curl -sf "http://localhost:14001/api/v1/work-orders/$WORK_ORDER_ID")
    STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

    echo -n -e "\r  Status: $STATUS (waited ${WAITED}s)    "

    case "$STATUS" in
        "SUCCEEDED")
            echo ""
            echo -e "${GREEN}✓ Work order completed successfully${NC}"
            break
            ;;
        "FAILED")
            echo ""
            echo -e "${RED}✗ Work order failed${NC}"
            echo "$STATUS_RESPONSE"
            exit 1
            ;;
        "QUEUED"|"RUNNING"|"BUILDING"|"SNAPSHOTTING"|"VERIFYING")
            sleep 5
            WAITED=$((WAITED + 5))
            ;;
        *)
            echo ""
            echo -e "${RED}Unknown status: $STATUS${NC}"
            exit 1
            ;;
    esac
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${RED}Timeout waiting for work order to complete${NC}"
    exit 1
fi

# =============================================================================
# Step 5: View logs
# =============================================================================
echo ""
echo -e "${YELLOW}Step 5: Server logs (last 20 lines):${NC}"
docker compose --env-file .env.e2e logs --tail 20 server

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              E2E Test Completed Successfully!                 ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
```

---

## Implementation Checklist

### Thrust 9: Configurable Limits

- [ ] Create `packages/server/src/config/index.ts`
- [ ] Add Zod schema for configuration validation
- [ ] Add environment variable reading
- [ ] Update `orchestrator.ts` to use config module
- [ ] Update `serve.ts` to log configuration
- [ ] Update health endpoint with limits
- [ ] Create `packages/server/test/config.test.ts`
- [ ] Run `pnpm typecheck` - passes
- [ ] Run `pnpm test` - passes
- [ ] Test with custom env vars

### Thrust 10: Docker Compose

- [ ] Create `docker/Dockerfile.server`
- [ ] Create `docker/Dockerfile.dashboard`
- [ ] Create `docker/nginx.conf`
- [ ] Create `docker-compose.yml`
- [ ] Create `docker-compose.dev.yml`
- [ ] Create `.env.example`
- [ ] Create `scripts/docker-setup.sh`
- [ ] Run `docker compose build` - succeeds
- [ ] Run `docker compose up -d` - containers healthy
- [ ] Test health endpoints
- [ ] Test API proxy through dashboard
- [ ] Test WebSocket proxy
- [ ] Submit test work order
- [ ] Verify logs show no errors

---

## Security Considerations

### Container Security

1. **Non-root user**: Containers run as `agentgate` user (UID 1001)
2. **Read-only filesystem**: Where possible, use read-only mounts
3. **No privileged mode**: Containers don't require privileged access
4. **Resource limits**: CPU and memory limits prevent DoS

### Network Security

1. **Internal network**: Containers communicate on private network
2. **Limited exposure**: Only necessary ports exposed to host
3. **No direct internet**: Agent containers can be network-isolated

### Secret Management

1. **Environment variables**: Secrets passed via env vars
2. **No secrets in images**: API keys never baked into Docker images
3. **.env not committed**: .env is in .gitignore

---

## Future Enhancements (Not in Scope)

These are out of scope for v0.2.10 but documented for future reference:

1. **Per-agent containers**: Spawn separate Docker container per agent execution
2. **Kubernetes deployment**: Helm charts for K8s deployment
3. **Secret manager integration**: HashiCorp Vault, AWS Secrets Manager
4. **Metrics export**: Prometheus/Grafana integration
5. **Log aggregation**: ELK stack or similar
