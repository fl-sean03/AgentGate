# Foundation Thrusts (Phase 1)

---

## Thrust 1: Development Environment Setup

### 1.1 Objective

Establish the laptop (Workshop) as the primary development environment with both repositories cloned and configured for local testing.

### 1.2 Background

All development, debugging, and testing happens on the laptop. The Workshop model requires:
- Both `agentgate` (OSS) and `agentgate-internal` (Private) repos cloned locally
- Local server instances for testing
- Fast edit-test-debug cycles
- No dependency on the home server for development

### 1.3 Subtasks

#### 1.3.1 Verify Local Environment

Ensure development prerequisites are installed:

```bash
# Required tools
node --version    # v20+
pnpm --version    # v8+
git --version
docker --version  # Optional for local testing

# Claude Code (for agent execution)
claude --version
```

#### 1.3.2 Clone Public Repository

```bash
cd ~/Workspace/main
git clone git@github.com:org/agentgate.git 43-AgentGate
cd 43-AgentGate
pnpm install
pnpm test
pnpm build
```

#### 1.3.3 Set Up Local Configuration

Create `~/.agentgate/config.yaml`:

```yaml
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

#### 1.3.4 Verify Local Server Runs

```bash
cd ~/Workspace/main/43-AgentGate/packages/server
pnpm dev

# In another terminal
curl http://localhost:3001/api/v1/health
# Expected: {"status":"ok","version":"..."}
```

#### 1.3.5 Test Work Order Submission (Local)

```bash
# Submit a test work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a hello.txt file with \"Hello World\"",
    "repositoryPath": "/tmp/test-repo",
    "verificationLevel": "L0"
  }'
```

### 1.4 Verification Steps

1. `pnpm install` completes without errors
2. `pnpm test` passes all tests
3. Local server starts on port 3001
4. Health endpoint returns `{"status":"ok"}`
5. Work order submission returns run ID

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `~/.agentgate/config.yaml` | Created |
| `~/Workspace/main/43-AgentGate/` | Cloned |

---

## Thrust 2: Private Repository Creation

### 2.1 Objective

Create the `agentgate-internal` private repository on GitHub with the proper structure to host SaaS components.

### 2.2 Background

The private repository extends the public OSS with SaaS-specific functionality:
- Credit-based billing (Stripe)
- Multi-tenant isolation
- OAuth authentication (GitHub)
- Customer dashboard
- Marketing website

### 2.3 Subtasks

#### 2.3.1 Create GitHub Repository

Create `agentgate-internal` as a private repository on GitHub with:
- No template (empty)
- Private visibility
- Description: "AgentGate SaaS Platform"

#### 2.3.2 Initialize Repository Structure

```bash
cd ~/Workspace/main
mkdir 44-AgentGate-Internal
cd 44-AgentGate-Internal
git init

# Create directory structure
mkdir -p packages/{saas-server,dashboard,web,scheduler}/src
mkdir -p infra/{docker,scripts}
mkdir -p docs
```

#### 2.3.3 Create Root Package Configuration

Create `package.json`:

```json
{
  "name": "agentgate-internal",
  "version": "0.2.31",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter saas-server dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

#### 2.3.4 Create saas-server Package

Create `packages/saas-server/package.json`:

```json
{
  "name": "@agentgate-internal/saas-server",
  "version": "0.2.31",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agentgate/server": "^0.2.31",
    "@agentgate/shared": "^0.2.31",
    "stripe": "^14.0.0",
    "express": "^4.18.2",
    "express-session": "^1.17.3"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.6.0",
    "vitest": "^1.0.0"
  }
}
```

Create `packages/saas-server/src/index.ts`:

```typescript
/**
 * AgentGate SaaS Server
 *
 * Extends the core @agentgate/server with:
 * - Credit-based billing
 * - Multi-tenant isolation
 * - OAuth authentication
 */

// Re-export core server
export * from '@agentgate/server';

// SaaS-specific exports will be added here
// export * from './billing/index.js';
// export * from './auth/index.js';
// export * from './multi-tenant/index.js';

console.log('AgentGate SaaS Server - placeholder');
```

#### 2.3.5 Create TypeScript Configuration

Create `tsconfig.json` (root):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

Create `packages/saas-server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

#### 2.3.6 Push to GitHub

```bash
git add .
git commit -m "Initial repository structure"
git branch -M main
git remote add origin git@github.com:org/agentgate-internal.git
git push -u origin main
```

### 2.4 Verification Steps

1. Repository exists on GitHub (private)
2. Can clone fresh: `git clone git@github.com:org/agentgate-internal.git`
3. `pnpm install` completes
4. `pnpm typecheck` passes
5. Basic structure matches spec

### 2.5 Files Created

| File | Action |
|------|--------|
| `package.json` | Created |
| `pnpm-workspace.yaml` | Created |
| `tsconfig.json` | Created |
| `packages/saas-server/package.json` | Created |
| `packages/saas-server/tsconfig.json` | Created |
| `packages/saas-server/src/index.ts` | Created |
| `README.md` | Created |

---

## Thrust 3: Local Integration Testing

### 3.1 Objective

Verify that the private repository can correctly import and extend the public OSS server using `pnpm link` for local development.

### 3.2 Background

Before publishing to npm, developers need to test cross-repo changes locally. The `pnpm link` command creates symlinks allowing the private repo to use local OSS changes.

### 3.3 Subtasks

#### 3.3.1 Link Public Server Package

```bash
# Terminal 1: Create global link from public repo
cd ~/Workspace/main/43-AgentGate/packages/server
pnpm link --global

# Terminal 2: Use link in private repo
cd ~/Workspace/main/44-AgentGate-Internal
pnpm link @agentgate/server
```

#### 3.3.2 Verify Import Works

Create a test file `packages/saas-server/src/test-import.ts`:

```typescript
import { createServer, getConfig } from '@agentgate/server';

async function testImport() {
  const config = getConfig();
  console.log('Config loaded:', !!config);

  // Just verify types work, don't actually start
  console.log('Import successful!');
}

testImport().catch(console.error);
```

Run: `npx tsx packages/saas-server/src/test-import.ts`

#### 3.3.3 Create Extension Example

Create `packages/saas-server/src/extensions/billing-middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Placeholder for billing middleware
 * Will check credits before allowing execution
 */
export function billingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // TODO: Check user's credit balance
    // For now, just pass through
    next();
  };
}
```

#### 3.3.4 Test Private Server Startup

Update `packages/saas-server/src/index.ts` to actually start:

```typescript
import { createServer } from '@agentgate/server';
import { billingMiddleware } from './extensions/billing-middleware.js';

async function main() {
  const app = await createServer();

  // Add SaaS middleware
  app.use('/api/v1', billingMiddleware());

  const port = process.env.PORT || 3002;
  app.listen(port, () => {
    console.log(`SaaS Server running on port ${port}`);
  });
}

main().catch(console.error);
```

#### 3.3.5 Verify Dual Server Development

Run both servers simultaneously:

```bash
# Terminal 1: OSS server on port 3001
cd ~/Workspace/main/43-AgentGate/packages/server
PORT=3001 pnpm dev

# Terminal 2: SaaS server on port 3002
cd ~/Workspace/main/44-AgentGate-Internal/packages/saas-server
PORT=3002 pnpm dev

# Terminal 3: Test both
curl http://localhost:3001/api/v1/health  # OSS
curl http://localhost:3002/api/v1/health  # SaaS
```

#### 3.3.6 Document Unlink Process

When done with local testing:

```bash
cd ~/Workspace/main/44-AgentGate-Internal
pnpm unlink @agentgate/server

# Re-install from npm
pnpm install
```

### 3.4 Verification Steps

1. `pnpm link` completes without errors
2. TypeScript can resolve types from linked package
3. Import test runs successfully
4. Private server starts with linked OSS
5. Both servers respond to health checks

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/saas-server/src/test-import.ts` | Created (can delete after) |
| `packages/saas-server/src/extensions/billing-middleware.ts` | Created |
| `packages/saas-server/src/index.ts` | Modified |

---

## Phase 1 Summary

After completing Phase 1, you have:

```
LAPTOP (Workshop)
├── ~/Workspace/main/43-AgentGate/           # OSS - working, tested
│   └── packages/server/                     # Can run locally on :3001
│
├── ~/Workspace/main/44-AgentGate-Internal/  # Private - scaffolded
│   └── packages/saas-server/                # Can import OSS, run on :3002
│
└── ~/.agentgate/config.yaml                 # Local configuration
```

**Capabilities Unlocked:**
- Edit OSS, test immediately locally
- Edit SaaS, test immediately locally
- Cross-repo changes with `pnpm link`
- Independent debugging of either repo

**Next Phase:** Repository Separation (Thrusts 4-6)
