# 02: Foundation - Package, API Client, Authentication

This document covers Thrusts 1-3, establishing the foundation for the TUI package.

---

## Dog Fooding Strategy

Each thrust in this DevGuide is designed to be implementable via AgentGate work orders. The pattern:

1. **Create a work order** for each thrust or subtask
2. **Use the GitHub workspace** pointing to the AgentGate monorepo
3. **Verify via existing gates** (L0-L3 verification)
4. **Review the PR** created by the agent

### Example Work Order for Thrust 1

```bash
# Using the AgentGate CLI (once TUI exists, this is what we're building!)
agentgate submit \
  --repo agentgate/agentgate \
  --prompt "Create the packages/tui package with React + Ink.
    Set up package.json with dependencies: ink, react, zustand, commander, ky, chalk.
    Create tsconfig.json extending the root config.
    Create src/index.tsx as the entry point that renders a simple 'Hello AgentGate' message.
    Add a bin entry pointing to dist/cli.js.
    Update the root pnpm-workspace.yaml to include packages/tui.
    Ensure pnpm install and pnpm build work from the root." \
  --max-iterations 3
```

### Breaking Down Work for Agents

Each subtask should be:
- **Self-contained**: Agent can complete without external context
- **Verifiable**: Tests or build commands prove success
- **Small enough**: Fits in agent's working memory
- **Clear deliverables**: Specific files to create/modify

---

## Thrust 1: Package Setup

### 1.1 Objective

Create the `packages/tui` package with React + Ink, integrated into the monorepo build system.

### 1.2 Background

The TUI package follows the same patterns as `packages/server` and `packages/dashboard`:
- TypeScript with strict mode
- ESM modules with `.js` extensions in imports
- Vitest for testing
- tsup for bundling

### 1.3 Subtasks

#### 1.3.1 Create Package Directory and Configuration

Create the package directory structure with proper configuration files.

**Files to create:**
- `packages/tui/package.json` - Package manifest with dependencies
- `packages/tui/tsconfig.json` - TypeScript configuration extending root
- `packages/tui/vitest.config.ts` - Test configuration
- `packages/tui/.eslintrc.cjs` - ESLint configuration

**Package.json requirements:**
- Name: `@agentgate/tui`
- Main entry: `dist/index.js`
- Bin entry: `agentgate` pointing to `dist/cli.js`
- Dependencies: ink, react, @inkjs/ui, zustand, commander, ky, chalk, eventsource
- Dev dependencies: @types/react, typescript, vitest, ink-testing-library, tsup

**Dog Food Work Order:**
```
Create the packages/tui directory with package.json, tsconfig.json, and vitest.config.ts.
The package should be named @agentgate/tui.
Include dependencies: ink@^5, react@^18, zustand@^4, commander@^12, ky@^1, chalk@^5, eventsource@^2.
Include devDependencies: @types/react@^18, typescript@^5, vitest@^2, ink-testing-library@^4, tsup@^8.
Extend tsconfig from ../../tsconfig.base.json.
Add the package to pnpm-workspace.yaml if not already there.
```

#### 1.3.2 Create Entry Point Files

Create the main entry point and CLI parser.

**Files to create:**
- `packages/tui/src/index.tsx` - Main entry, renders App
- `packages/tui/src/cli.ts` - Commander-based CLI parsing
- `packages/tui/src/App.tsx` - Root Ink component

**Dog Food Work Order:**
```
In packages/tui, create the entry point files:

1. src/cli.ts - Use Commander.js to parse CLI arguments:
   - No subcommand: launch interactive TUI
   - 'run <repo>' subcommand: go directly to task input for that repo
   - 'runs' subcommand: show runs list
   - 'logout' subcommand: clear credentials
   Add --version and --help flags.

2. src/index.tsx - Import from cli.ts and render the App component using Ink's render().

3. src/App.tsx - Root component that:
   - Uses React.useState for current screen
   - Renders appropriate screen based on state
   - For now, just render a Box with Text saying "AgentGate TUI"

Ensure the files use ESM imports with .js extensions.
```

#### 1.3.3 Configure Build System

Set up tsup for bundling the CLI.

**Files to create:**
- `packages/tui/tsup.config.ts` - Bundle configuration

**Requirements:**
- Entry points: src/index.tsx, src/cli.ts
- Output format: ESM
- Target: Node 18+
- Generate sourcemaps
- Shebang for cli.ts output

**Dog Food Work Order:**
```
Create packages/tui/tsup.config.ts that:
- Has entry points for src/cli.ts and src/index.tsx
- Outputs to dist/ directory
- Uses ESM format
- Targets Node 18
- Generates sourcemaps
- Adds shebang (#!/usr/bin/env node) to cli.js output

Add build script to package.json: "build": "tsup"
Add dev script: "dev": "tsup --watch"

Test that pnpm build works from packages/tui.
```

### 1.4 Verification Steps

1. Run `pnpm install` from monorepo root - should succeed
2. Run `pnpm build` from packages/tui - should produce dist/cli.js
3. Run `node dist/cli.js --version` - should print version
4. Run `node dist/cli.js` - should show "AgentGate TUI" text

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/package.json` | Created | Package manifest |
| `packages/tui/tsconfig.json` | Created | TypeScript config |
| `packages/tui/vitest.config.ts` | Created | Test config |
| `packages/tui/tsup.config.ts` | Created | Bundle config |
| `packages/tui/src/cli.ts` | Created | CLI entry |
| `packages/tui/src/index.tsx` | Created | Render entry |
| `packages/tui/src/App.tsx` | Created | Root component |
| `pnpm-workspace.yaml` | Modified | Add packages/tui |

---

## Thrust 2: API Client

### 2.1 Objective

Create a type-safe API client for communicating with the AgentGate server.

### 2.2 Background

The TUI needs to:
- Authenticate users via OAuth device flow
- Fetch user's connected GitHub repositories
- Submit work orders
- Poll for status updates
- Stream run activity via SSE

The API client wraps these operations with proper error handling and type safety.

### 2.3 Subtasks

#### 2.3.1 Create API Client Core

Create the base HTTP client with authentication.

**Files to create:**
- `packages/tui/src/api/client.ts` - ky-based HTTP client
- `packages/tui/src/api/types.ts` - API response types

**Requirements:**
- Use ky for HTTP requests
- Include auth token in Authorization header
- Handle token refresh automatically
- Throw typed errors for API failures
- Base URL from config

**Dog Food Work Order:**
```
Create the API client in packages/tui/src/api/:

1. types.ts - Define TypeScript types for:
   - ApiResponse<T> wrapper with success, data, error fields
   - WorkOrder type matching server schema
   - Run type matching server schema
   - Repository type for GitHub repos
   - ApiError type with code, message, details

2. client.ts - Create ApiClient class using ky:
   - Constructor takes baseUrl and optional token
   - Methods: getRepos(), submitWorkOrder(), getWorkOrder(), getRuns(), cancelWorkOrder()
   - Include Authorization header when token is set
   - Parse JSON responses into typed objects
   - Throw ApiError on non-2xx responses
   - Export singleton instance

Use ESM imports with .js extensions.
```

#### 2.3.2 Create SSE Streaming Client

Create a client for streaming run activity.

**Files to create:**
- `packages/tui/src/api/stream.ts` - SSE streaming for run activity

**Requirements:**
- Connect to /api/v1/runs/:id/stream
- Parse incoming events into typed objects
- Emit events via callback
- Handle reconnection on disconnect
- Clean disconnect on abort

**Dog Food Work Order:**
```
Create packages/tui/src/api/stream.ts:

Create a RunStream class that:
- Takes runId and auth token in constructor
- connect() method opens SSE connection to /api/v1/runs/{runId}/stream
- Parses incoming events (agent:activity, verification:progress, run:completed)
- Calls registered callbacks with typed event data
- disconnect() method closes the connection cleanly
- Handles automatic reconnection with exponential backoff
- Accepts AbortSignal for cancellation

Export types for each event type:
- AgentActivityEvent (tool, file, output)
- VerificationProgressEvent (level, status, details)
- RunCompletedEvent (result, prUrl, error)
```

#### 2.3.3 Create Auth Token Manager

Create token storage and management.

**Files to create:**
- `packages/tui/src/api/auth.ts` - Token storage and refresh

**Requirements:**
- Store tokens in config file
- Check expiration before requests
- Refresh token when expired
- Clear tokens on logout

**Dog Food Work Order:**
```
Create packages/tui/src/api/auth.ts:

Create AuthManager class that:
- Stores/retrieves token from ~/.agentgate/config.json
- getToken() returns current token or null if expired
- setToken(token, refreshToken, expiresAt) saves credentials
- clearToken() removes credentials
- isAuthenticated() checks if valid token exists
- refreshIfNeeded() refreshes token if close to expiry

Use node:fs for file operations.
Ensure config directory is created if it doesn't exist.
Handle file permission errors gracefully.
```

### 2.4 Verification Steps

1. Unit tests pass for API client methods
2. Mock server responses work correctly
3. Token storage persists across restarts
4. SSE stream connects and receives events

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/api/client.ts` | Created | HTTP API client |
| `packages/tui/src/api/types.ts` | Created | API type definitions |
| `packages/tui/src/api/stream.ts` | Created | SSE streaming client |
| `packages/tui/src/api/auth.ts` | Created | Token management |
| `packages/tui/test/api/client.test.ts` | Created | API client tests |

---

## Thrust 3: Authentication Flow

### 3.1 Objective

Implement browser-based OAuth authentication using device code flow.

### 3.2 Background

The TUI uses OAuth device code flow:
1. TUI requests device code from server
2. Server returns code and verification URL
3. TUI opens browser to verification URL
4. User authenticates in browser
5. TUI polls server until auth completes
6. Server returns tokens
7. TUI stores tokens locally

This is the same flow used by GitHub CLI, AWS CLI, and other terminal tools.

### 3.3 Subtasks

#### 3.3.1 Create Login Screen Component

Create the visual login screen.

**Files to create:**
- `packages/tui/src/screens/Login.tsx` - Login screen component

**Requirements:**
- Initial state: "Press Enter to login" message
- After Enter: "Waiting for authentication..." with spinner
- On success: "Logged in as {email}" message
- On error: Error message with retry option
- Centered layout with AgentGate branding

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Login.tsx:

Create a Login screen component using Ink that:
- Shows welcome message and "Press Enter to login" initially
- On Enter keypress, calls startAuth()
- Shows spinner with "Waiting for authentication..." during auth
- Opens browser to verification URL using 'open' package
- Polls auth endpoint until complete
- Shows success message with email on completion
- Shows error message with [r] retry option on failure
- Calls onLogin(token) callback when auth succeeds

Use the Box and Text components from Ink.
Center the content vertically and horizontally.
Use the useInput hook for keyboard handling.
```

#### 3.3.2 Implement Device Auth Flow

Create the auth flow logic.

**Files to create:**
- `packages/tui/src/hooks/useAuth.ts` - Auth state and actions

**Requirements:**
- startAuth() initiates device code flow
- Polls /auth/device/:code endpoint
- Times out after 5 minutes
- Stores token on success
- Returns loading/error states

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useAuth.ts:

Create a useAuth hook that provides:
- isAuthenticated: boolean
- isLoading: boolean
- error: string | null
- user: { email: string } | null
- startAuth(): Promise<void> - initiates device code flow
- logout(): void - clears credentials

The startAuth flow:
1. POST /auth/device to get deviceCode and verificationUrl
2. Open verificationUrl in browser using 'open' package
3. Poll GET /auth/device/{deviceCode} every 2 seconds
4. On success, store token via AuthManager
5. On timeout (5 min), throw error
6. On error, set error state

Use the AuthManager from api/auth.ts for token storage.
```

#### 3.3.3 Integrate with App Router

Connect auth to the app flow.

**Files to modify:**
- `packages/tui/src/App.tsx` - Add auth check and routing

**Requirements:**
- Check auth state on startup
- Show Login screen if not authenticated
- Show Home screen if authenticated
- Handle logout navigation

**Dog Food Work Order:**
```
Modify packages/tui/src/App.tsx to:

1. Use the useAuth hook to check authentication state
2. If not authenticated, show the Login screen
3. If authenticated, show the Home screen (placeholder for now)
4. Pass onLogin callback to Login that triggers re-render
5. Handle logout by clearing auth and returning to Login

Add a simple screen router using React state:
- screen: 'login' | 'home' | 'task' | 'running' | 'result' | 'runs'
- Start at 'login' if not authenticated, 'home' if authenticated
```

#### 3.3.4 Add Logout Command

Implement logout functionality.

**Files to modify:**
- `packages/tui/src/cli.ts` - Add logout command

**Requirements:**
- `agentgate logout` clears stored credentials
- Prints confirmation message
- Exits cleanly

**Dog Food Work Order:**
```
Add a logout command to packages/tui/src/cli.ts:

program
  .command('logout')
  .description('Clear stored credentials')
  .action(async () => {
    // Import and use AuthManager to clear token
    // Print "Logged out successfully"
    // Exit process
  });

Test that 'agentgate logout' works after building.
```

### 3.4 Verification Steps

1. `agentgate` shows login screen when not authenticated
2. Pressing Enter opens browser (or prints URL if browser fails)
3. After authenticating in browser, TUI shows success
4. Subsequent `agentgate` invocations skip login
5. `agentgate logout` clears credentials
6. After logout, `agentgate` shows login again

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/screens/Login.tsx` | Created | Login screen |
| `packages/tui/src/hooks/useAuth.ts` | Created | Auth hook |
| `packages/tui/src/App.tsx` | Modified | Add auth routing |
| `packages/tui/src/cli.ts` | Modified | Add logout command |
| `packages/tui/test/screens/Login.test.tsx` | Created | Login tests |

---

## Phase 1 Completion Checklist

After completing Thrusts 1-3:

- [ ] `packages/tui` exists with proper configuration
- [ ] `pnpm install` succeeds from monorepo root
- [ ] `pnpm build` produces working CLI
- [ ] `agentgate --version` prints version
- [ ] `agentgate` shows login when not authenticated
- [ ] Browser-based auth flow works
- [ ] Tokens persist across sessions
- [ ] `agentgate logout` clears credentials
- [ ] All new code has tests
- [ ] No lint errors in packages/tui

---

## Next Steps

After Phase 1, proceed to [03-core-screens.md](./03-core-screens.md) for the main UI screens.
