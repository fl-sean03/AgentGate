# Deployment Thrusts (Phase 3)

---

## Thrust 7: Home Server Setup

### 7.1 Objective

Deploy the SaaS server to the home server (Dell desktop) with Docker containers for production operation.

### 7.2 Background

The Storefront (home server) runs the production SaaS version:
- Always-on service (24/7)
- Docker containers for isolation
- Pulls from GitHub (no local development)
- Auto-restart on failure
- Serves external users

The operator on the home server follows a separate deployment guide (see `07-home-server-deployment.md`).

### 7.3 Subtasks

#### 7.3.1 Create Docker Configuration

Create `infra/docker/Dockerfile.saas-server`:

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/saas-server/package.json packages/saas-server/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY packages/saas-server/dist packages/saas-server/dist

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "packages/saas-server/dist/index.js"]
```

#### 7.3.2 Create Docker Compose

Create `infra/docker/docker-compose.yml`:

```yaml
version: '3.8'

services:
  saas-server:
    build:
      context: ../..
      dockerfile: infra/docker/Dockerfile.saas-server
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - agentgate-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  dashboard:
    build:
      context: ../..
      dockerfile: infra/docker/Dockerfile.dashboard
    ports:
      - "3000:3000"
    environment:
      - API_URL=http://saas-server:8080
    restart: unless-stopped

volumes:
  agentgate-data:
```

#### 7.3.3 Create Deployment Script

Create `infra/scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== AgentGate SaaS Deployment ==="

# Navigate to repo root
cd "$(dirname "$0")/../.."

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Build containers
echo "Building containers..."
docker-compose -f infra/docker/docker-compose.yml build

# Stop old containers
echo "Stopping old containers..."
docker-compose -f infra/docker/docker-compose.yml down

# Start new containers
echo "Starting new containers..."
docker-compose -f infra/docker/docker-compose.yml up -d

# Wait for health check
echo "Waiting for health check..."
sleep 10

# Verify
curl -f http://localhost:8080/api/v1/health || {
  echo "Health check failed!"
  docker-compose -f infra/docker/docker-compose.yml logs
  exit 1
}

echo "=== Deployment Complete ==="
```

#### 7.3.4 Set Up Home Server Directory

On the home server:

```bash
# Create deployment directory
sudo mkdir -p /opt/agentgate
sudo chown $USER:$USER /opt/agentgate
cd /opt/agentgate

# Clone private repository
git clone git@github.com:org/agentgate-internal.git .

# Create environment file
cp .env.example .env
# Edit .env with production secrets

# Initial deployment
./infra/scripts/deploy.sh
```

#### 7.3.5 Configure Systemd Service

Create `/etc/systemd/system/agentgate.service`:

```ini
[Unit]
Description=AgentGate SaaS Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=agentgate
WorkingDirectory=/opt/agentgate
ExecStart=/usr/bin/docker-compose -f infra/docker/docker-compose.yml up
ExecStop=/usr/bin/docker-compose -f infra/docker/docker-compose.yml down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable agentgate
sudo systemctl start agentgate
```

### 7.4 Verification Steps

1. Docker images build successfully
2. Containers start without errors
3. Health endpoint responds: `curl http://localhost:8080/api/v1/health`
4. Dashboard accessible: `curl http://localhost:3000`
5. Systemd service status is active
6. Containers auto-restart after reboot

### 7.5 Files Created

| File | Location | Action |
|------|----------|--------|
| `Dockerfile.saas-server` | `infra/docker/` | Created |
| `Dockerfile.dashboard` | `infra/docker/` | Created |
| `docker-compose.yml` | `infra/docker/` | Created |
| `deploy.sh` | `infra/scripts/` | Created |
| `.env.example` | Root | Created |
| `agentgate.service` | `/etc/systemd/system/` | Created (on server) |

---

## Thrust 8: CI/CD Pipelines

### 8.1 Objective

Set up continuous integration and deployment pipelines for both repositories.

### 8.2 Background

Each repository needs independent CI/CD:

| Repository | CI | CD |
|------------|----|----|
| Public (agentgate) | Tests, lint, build | npm publish on release |
| Private (agentgate-internal) | Tests, lint, build | Deploy to home server |

### 8.3 Subtasks

#### 8.3.1 Public Repo CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

#### 8.3.2 Public Repo Release

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm publish --filter @agentgate/server --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: pnpm publish --filter @agentgate/shared --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### 8.3.3 Private Repo CI

Create `.github/workflows/ci.yml` in private repo:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

#### 8.3.4 Private Repo Deployment

Create `.github/workflows/deploy.yml` in private repo:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Home Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOME_SERVER_HOST }}
          username: ${{ secrets.HOME_SERVER_USER }}
          key: ${{ secrets.HOME_SERVER_SSH_KEY }}
          script: |
            cd /opt/agentgate
            ./infra/scripts/deploy.sh
```

#### 8.3.5 OSS Update Sync

Create `.github/workflows/sync-oss.yml` in private repo:

```yaml
name: Sync OSS Updates

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Check for OSS updates
        run: |
          pnpm outdated @agentgate/server || true

      - name: Create PR if updates available
        run: |
          # Update dependencies
          pnpm update @agentgate/server @agentgate/shared

          # Check for changes
          if git diff --quiet; then
            echo "No updates available"
            exit 0
          fi

          # Create branch and PR
          git checkout -b update-oss-$(date +%Y%m%d)
          git add .
          git commit -m "chore: update @agentgate/server"
          git push -u origin HEAD
          gh pr create --title "Update AgentGate OSS" --body "Automated OSS dependency update"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 8.4 Verification Steps

1. Public CI runs on push/PR
2. Public release publishes to npm on tag
3. Private CI runs on push/PR
4. Private deploy triggers on main push
5. OSS sync creates PRs when updates available

### 8.5 Files Created

**Public Repo:**

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Created/Modified |
| `.github/workflows/release.yml` | Created/Modified |

**Private Repo:**

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Created |
| `.github/workflows/deploy.yml` | Created |
| `.github/workflows/sync-oss.yml` | Created |

---

## Thrust 9: Monitoring & Logs

### 9.1 Objective

Set up monitoring and log aggregation for the production deployment on the home server.

### 9.2 Background

Production observability requires:
- Health checks (is the service running?)
- Metrics (how is it performing?)
- Logs (what happened?)
- Alerts (notify on problems)

### 9.3 Subtasks

#### 9.3.1 Add Health Check Endpoint Enhancement

Enhance `/api/v1/health` to include:

```typescript
// packages/saas-server/src/routes/health.ts
app.get('/api/v1/health', async (req, res) => {
  const health = {
    status: 'ok',
    version: process.env.npm_package_version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      stripe: await checkStripe(),
    }
  };

  const allHealthy = Object.values(health.checks)
    .every(check => check.status === 'ok');

  res.status(allHealthy ? 200 : 503).json(health);
});
```

#### 9.3.2 Configure Structured Logging

```typescript
// packages/saas-server/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'agentgate-saas',
    version: process.env.npm_package_version,
  },
});
```

#### 9.3.3 Add Docker Log Configuration

Update `docker-compose.yml`:

```yaml
services:
  saas-server:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
```

#### 9.3.4 Create Log Viewing Script

Create `infra/scripts/logs.sh`:

```bash
#!/bin/bash

SERVICE=${1:-saas-server}
LINES=${2:-100}

echo "=== Last $LINES lines from $SERVICE ==="
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml \
  logs --tail=$LINES $SERVICE

echo ""
echo "=== Following logs (Ctrl+C to exit) ==="
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml \
  logs -f $SERVICE
```

#### 9.3.5 Set Up Simple Monitoring Script

Create `infra/scripts/monitor.sh`:

```bash
#!/bin/bash

# Simple health check monitor
ENDPOINT="http://localhost:8080/api/v1/health"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL}"

check_health() {
  response=$(curl -s -w "\n%{http_code}" "$ENDPOINT")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)

  if [ "$http_code" != "200" ]; then
    echo "Health check failed! HTTP $http_code"
    if [ -n "$SLACK_WEBHOOK" ]; then
      curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"AgentGate health check failed: HTTP $http_code\"}" \
        "$SLACK_WEBHOOK"
    fi
    return 1
  fi

  echo "Health OK: $body"
  return 0
}

check_health
```

#### 9.3.6 Add Cron Job for Monitoring

On home server:

```bash
# Add to crontab
crontab -e

# Add line:
*/5 * * * * /opt/agentgate/infra/scripts/monitor.sh >> /var/log/agentgate-monitor.log 2>&1
```

### 9.4 Verification Steps

1. Health endpoint returns detailed status
2. Logs are structured JSON
3. Log files don't exceed size limits
4. `logs.sh` script shows recent logs
5. Monitor script detects failures
6. Cron job runs every 5 minutes

### 9.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/saas-server/src/routes/health.ts` | Modified |
| `packages/saas-server/src/utils/logger.ts` | Created |
| `infra/docker/docker-compose.yml` | Modified |
| `infra/scripts/logs.sh` | Created |
| `infra/scripts/monitor.sh` | Created |

---

## Phase 3 Summary

After completing Phase 3, you have:

```
HOME SERVER (Storefront)
├── /opt/agentgate/
│   ├── infra/docker/
│   │   ├── docker-compose.yml
│   │   └── Dockerfile.*
│   ├── infra/scripts/
│   │   ├── deploy.sh
│   │   ├── logs.sh
│   │   └── monitor.sh
│   └── .env (secrets)
│
├── Docker containers running
│   ├── saas-server:8080
│   └── dashboard:3000
│
├── Systemd service (auto-start)
├── Health monitoring (cron)
└── Structured logging

LAPTOP (Workshop)
├── Can push to trigger deploy
├── Can view production logs
└── Development still works locally
```

**Capabilities Unlocked:**
- Production server runs 24/7
- Auto-deploy on push to main
- Health monitoring with alerts
- Log aggregation for debugging
- Auto-restart on failure/reboot

**Next Phase:** Automation (Thrusts 10-12) - Future
