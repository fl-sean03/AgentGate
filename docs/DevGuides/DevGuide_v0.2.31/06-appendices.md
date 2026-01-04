# Appendices

---

## A. Component Inventory

### A.1 Public Repository Components

| Package | Status | Notes |
|---------|--------|-------|
| `packages/server` | Keep | Core orchestration engine |
| `packages/shared` | Keep | Shared TypeScript types |
| `packages/tui` | Modify | Remove SaaS features |
| `packages/dashboard` | Migrate | Move to private repo |
| `packages/web` | Migrate | Move to private repo |

### A.2 Server Module Classification

| Module | Classification | Action |
|--------|---------------|--------|
| `orchestrator/` | Core | Keep |
| `execution/` | Core | Keep |
| `verifier/` | Core | Keep |
| `sandbox/` | Core | Keep |
| `delivery/` | Core | Keep |
| `agent/` | Core | Keep |
| `config/` | Core | Keep |
| `errors/` | Core | Keep |
| `gate/` | Core | Keep |
| `queue/` | Core | Keep |
| `server/` | Core | Keep |
| `process/` | Core | Keep |
| `utils/` | Core | Keep |
| `types/` | Core | Keep |
| `billing/` | Hybrid | Simplify - keep usage tracking only |
| `extensibility/` | Core | Keep |
| `artifacts/` | Core | Keep |
| `github/` | Core | Keep |
| `git/` | Core | Keep |
| `control-plane/` | Core | Keep |
| `feedback/` | Core | Keep |

---

## B. Migration Checklist

### B.1 Pre-Migration (Phase 1)

- [ ] Development environment set up on laptop
- [ ] Public repo cloned and tested
- [ ] Local config created (`~/.agentgate/config.yaml`)
- [ ] Private repository created on GitHub
- [ ] Private repo structure initialized
- [ ] TypeScript compilation works
- [ ] `pnpm link` tested between repos

### B.2 Package Migration (Phase 2)

- [ ] Dashboard copied to private repo
- [ ] Dashboard imports updated to use npm packages
- [ ] Dashboard builds successfully in private repo
- [ ] Web package copied to private repo
- [ ] Web imports updated
- [ ] Web builds successfully in private repo
- [ ] Pre-split tag created in public repo (`pre-split-v0.2.31`)

### B.3 Public Cleanup (Phase 2)

- [ ] Dashboard deleted from public repo
- [ ] Web deleted from public repo
- [ ] TUI SaaS features removed
- [ ] Billing module simplified (credits removed)
- [ ] `pnpm-workspace.yaml` updated
- [ ] README rewritten for OSS
- [ ] CLAUDE.md updated
- [ ] DevGuides README updated

### B.4 Deployment (Phase 3)

- [ ] Docker configuration created
- [ ] Docker Compose file tested
- [ ] Deploy script created
- [ ] Home server directory set up (`/opt/agentgate`)
- [ ] Environment file created (`.env`)
- [ ] Systemd service configured
- [ ] Initial deployment successful
- [ ] Health check passing

### B.5 CI/CD (Phase 3)

- [ ] Public CI workflow updated
- [ ] Public release workflow updated
- [ ] Private CI workflow created
- [ ] Private deploy workflow created
- [ ] OSS sync workflow created
- [ ] Secrets configured in GitHub

### B.6 Verification (Final)

- [ ] Public repo installs standalone (`pnpm install`)
- [ ] Public repo tests pass (`pnpm test`)
- [ ] Public repo builds (`pnpm build`)
- [ ] Private repo builds
- [ ] Private repo imports public correctly
- [ ] No SaaS references in public grep
- [ ] Production server healthy
- [ ] Auto-deploy works

---

## C. API Surface Changes

### C.1 Public API (Preserved)

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/work-orders` | Submit work order |
| `GET /api/v1/work-orders` | List work orders |
| `GET /api/v1/work-orders/:id` | Get work order |
| `DELETE /api/v1/work-orders/:id` | Cancel work order |
| `GET /api/v1/runs/:id` | Get run details |
| `GET /api/v1/runs/:id/iterations` | Get iterations |
| `GET /api/v1/queue` | Queue status |
| `GET /api/v1/health` | Health check |
| `GET /api/v1/usage` | Local usage records |
| `GET /api/v1/usage/summary` | Usage summary |
| `GET /api/v1/usage/work-orders/:id` | Work order usage |
| `GET /api/v1/profiles` | Harness profiles |
| `GET /api/v1/audit` | Audit log |

### C.2 Removed from Public

| Endpoint | Reason |
|----------|--------|
| `POST /api/v1/credits/purchase` | SaaS billing |
| `GET /api/v1/billing/usage` | SaaS billing |
| `GET /api/v1/organization` | Multi-tenant |
| `POST /api/v1/auth/github` | SaaS OAuth |
| `GET /api/v1/subscription` | SaaS plans |

### C.3 Private-Only API (SaaS)

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | User authentication |
| `POST /api/v1/auth/logout` | End session |
| `GET /api/v1/auth/me` | Current user |
| `POST /api/v1/credits/purchase` | Buy credits |
| `GET /api/v1/credits/balance` | Credit balance |
| `GET /api/v1/organization` | Org details |
| `POST /api/v1/organization/invite` | Invite member |
| `GET /api/v1/api-keys` | List API keys |
| `POST /api/v1/api-keys` | Create API key |
| `DELETE /api/v1/api-keys/:id` | Revoke API key |

---

## D. Configuration Comparison

### D.1 Public Repo Config Example

```yaml
# ~/.agentgate/config.yaml (Local Self-Hosted)
server:
  port: 3001
  host: localhost

agentDriver:
  type: claude-code-subscription
  sandbox:
    provider: subprocess

execution:
  maxConcurrentRuns: 2
  defaultTimeoutSeconds: 3600

usage:
  trackLocally: true
  displayCosts: true
  storageDir: ~/.agentgate/usage
```

### D.2 Private Repo Config Extension

```yaml
# SaaS Deployment Config (extends public)
extends: "@agentgate/server/config"

server:
  port: 8080
  host: 0.0.0.0

multiTenant:
  enabled: true
  isolation: strict

billing:
  enabled: true
  provider: stripe
  stripeSecretKey: ${STRIPE_SECRET_KEY}
  creditsPerDollar: 100

  limits:
    freeCredits: 10
    maxRunsPerDay: 50

auth:
  providers:
    - github
  githubClientId: ${GITHUB_CLIENT_ID}
  githubClientSecret: ${GITHUB_CLIENT_SECRET}

database:
  url: ${DATABASE_URL}

redis:
  url: ${REDIS_URL}
```

---

## E. Term Replacements

When updating public repo text, replace these terms:

| SaaS Term | Public Replacement |
|-----------|-------------------|
| "credits" | "tokens" or "estimated cost" |
| "credit balance" | "usage statistics" |
| "buy credits" | (remove) |
| "your plan" | "your configuration" |
| "quota" | "limit" (or remove) |
| "subscription" (SaaS) | (remove or clarify) |
| "billing" | "usage tracking" |
| "account" | "configuration" |
| "login" | (remove) |
| "sign up" | "install" |

---

## F. File Deletion Checklist

Files to delete from public repo after migration:

### F.1 Entire Directories

- [ ] `packages/dashboard/`
- [ ] `packages/web/`

### F.2 Individual Files (if not whole directory)

- [ ] Any `.env.production` files with SaaS configs
- [ ] Any deployment scripts for SaaS infrastructure
- [ ] Any SaaS-specific test fixtures

---

## G. Post-Split Verification Commands

### G.1 Public Repo Verification

```bash
# Should all pass without SaaS components
cd ~/Workspace/main/43-AgentGate
pnpm install
pnpm typecheck
pnpm test
pnpm build

# Should find no SaaS references
grep -r "credits" packages/ --include="*.ts" | grep -v test | grep -v node_modules
# Expected: No results (or only in usage context)

grep -r "CreditBalance" packages/
# Expected: No results

grep -r "saas" packages/ --include="*.ts" -i
# Expected: No results
```

### G.2 Private Repo Verification

```bash
cd ~/Workspace/main/43-AgentGate/agentgate-internal
pnpm install
pnpm typecheck
pnpm build

# Verify core import works
node -e "require('@agentgate/server')"

# Run full test suite
pnpm test
```

### G.3 Production Verification

```bash
# On home server
curl http://localhost:8080/api/v1/health
# Expected: {"status":"ok",...}

# Check containers
docker ps
# Expected: saas-server and dashboard running

# Check logs
docker logs agentgate-saas-server --tail 50
```

---

## H. Rollback Plan

If issues arise during migration:

### H.1 Before Any Deletion

- Tag public repo: `git tag pre-split-v0.2.31`
- Create backup branch: `git checkout -b backup/pre-split`

### H.2 Rollback Steps

1. Checkout backup branch: `git checkout backup/pre-split`
2. Reset main to backup: `git checkout main && git reset --hard backup/pre-split`
3. Force push if needed: `git push origin main --force`

### H.3 Partial Rollback

If only specific packages need rollback:
1. Cherry-pick deleted files from backup branch
2. Restore package.json references
3. Update pnpm-workspace.yaml

---

## I. Environment Variables Reference

### I.1 Public Repo (Local Development)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `AGENTGATE_CONFIG` | Config file path | `~/.agentgate/config.yaml` |

### I.2 Private Repo (Production)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default 8080) |
| `NODE_ENV` | Environment | Yes |
| `STRIPE_SECRET_KEY` | Stripe API key | Yes |
| `GITHUB_CLIENT_ID` | OAuth client ID | Yes |
| `GITHUB_CLIENT_SECRET` | OAuth client secret | Yes |
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `REDIS_URL` | Redis connection | No |
| `LOG_LEVEL` | Logging verbosity | No |

---

## J. Quick Reference Commands

### J.1 Development (Laptop)

```bash
# Start OSS server
cd ~/Workspace/main/43-AgentGate && pnpm dev

# Start SaaS server (linked)
cd ~/Workspace/main/43-AgentGate/agentgate-internal && pnpm dev

# Link for cross-repo testing
cd ~/Workspace/main/43-AgentGate/agentgate/packages/server && pnpm link --global
cd ~/Workspace/main/43-AgentGate/agentgate-internal && pnpm link @agentgate/server

# Unlink after testing
cd ~/Workspace/main/43-AgentGate/agentgate-internal && pnpm unlink @agentgate/server
```

### J.2 Production (Home Server)

```bash
# Deploy latest
cd /opt/agentgate && ./infra/scripts/deploy.sh

# View logs
./infra/scripts/logs.sh saas-server 100

# Check health
curl http://localhost:8080/api/v1/health

# Restart services
docker-compose -f infra/docker/docker-compose.yml restart

# Check status
sudo systemctl status agentgate
```
