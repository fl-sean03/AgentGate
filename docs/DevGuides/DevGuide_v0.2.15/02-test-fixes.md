# 02: Test Fixes - Thrusts 1-2

## Thrust 1: Fix Contract Test Resolution

### 1.1 Objective

Fix the `@agentgate/shared` package resolution error that causes contract tests to fail across all platforms.

### 1.2 Background

The error occurs because:
1. Contract tests import from `@agentgate/shared`
2. Vitest resolves the import at runtime
3. The shared package isn't built before tests run
4. The `dist/` directory doesn't exist or is stale

**Error Message:**
```
Error: Failed to resolve entry for package "@agentgate/shared".
The package may have incorrect main/module/exports specified in its package.json.
```

### 1.3 Subtasks

#### 1.3.1 Update CI Workflow Build Order

Modify `.github/workflows/ci.yml` to build shared package before running tests.

In the `test` job, before running tests:
```yaml
- name: Build shared package
  run: pnpm --filter @agentgate/shared build
```

#### 1.3.2 Verify Local Build Works

The test should pass after building shared:
```bash
pnpm --filter @agentgate/shared build
pnpm --filter @agentgate/server test test/contract/work-orders.contract.test.ts
```

#### 1.3.3 Add TypeScript Path Resolution (Alternative)

If build order doesn't work, configure Vitest to resolve via source:

In `packages/server/vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    // ... existing config
  },
  resolve: {
    alias: {
      '@agentgate/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
```

### 1.4 Verification Steps

1. Run contract tests locally:
   ```bash
   pnpm --filter @agentgate/shared build
   pnpm --filter @agentgate/server test test/contract/work-orders.contract.test.ts
   ```
   Expected: All 15 tests pass

2. Run full test suite:
   ```bash
   pnpm build
   pnpm test
   ```
   Expected: No resolution errors

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Modified - Add build step |
| `packages/server/vitest.config.ts` | Modified (if alias needed) |

---

## Thrust 2: Fix Platform-Specific Path Tests

### 2.1 Objective

Make path-comparing tests work correctly on macOS and Windows by using proper path normalization.

### 2.2 Background

**macOS Issue:**
- `/tmp` is a symlink to `/private/tmp`
- `pwd` command resolves symlinks
- Test expects `/tmp` but gets `/private/tmp`

**Windows Issue:**
- No `/tmp` directory exists
- Windows uses `C:\Users\...\AppData\Local\Temp`
- Path separators differ (`\` vs `/`)

### 2.3 Subtasks

#### 2.3.1 Fix streaming-executor.test.ts

**Current Code (Line 329-343):**
```typescript
it('should use working directory', async () => {
  const result = await executor.execute('pwd', [], {
    cwd: '/tmp',
  });
  expect(result.success).toBe(true);
  expect(result.stdout.trim()).toBe('/tmp');
});
```

**Fixed Code:**
```typescript
it('should use working directory', async () => {
  vi.useRealTimers();

  // Use os.tmpdir() for cross-platform temp directory
  const tempDir = os.tmpdir();

  const executor = new StreamingExecutor({
    workOrderId,
    runId,
  });

  const result = await executor.execute('pwd', [], {
    cwd: tempDir,
  });

  expect(result.success).toBe(true);

  // Normalize paths (resolves symlinks on macOS)
  const expectedPath = await fs.realpath(tempDir);
  expect(result.stdout.trim()).toBe(expectedPath);
});
```

**Required Imports:**
```typescript
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
```

#### 2.3.2 Fix subprocess-provider.test.ts - workspace cwd

**Current Code (Line 123-128):**
```typescript
it('should use workspace as cwd', async () => {
  const result = await sandbox!.execute('pwd', []);

  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe(tempDir);
});
```

**Fixed Code:**
```typescript
it('should use workspace as cwd', async () => {
  const result = await sandbox!.execute('pwd', []);

  expect(result.exitCode).toBe(0);

  // Normalize path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
  const expectedPath = await fs.realpath(tempDir);
  expect(result.stdout.trim()).toBe(expectedPath);
});
```

#### 2.3.3 Fix subprocess-provider.test.ts - custom cwd

**Current Code (Line 130-140):**
```typescript
it('should use custom cwd within workspace', async () => {
  const subdir = 'subdir';
  await fs.mkdir(path.join(tempDir, subdir));

  const result = await sandbox!.execute('pwd', [], {
    cwd: subdir,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe(path.join(tempDir, subdir));
});
```

**Fixed Code:**
```typescript
it('should use custom cwd within workspace', async () => {
  const subdir = 'subdir';
  const subdirPath = path.join(tempDir, subdir);
  await fs.mkdir(subdirPath);

  const result = await sandbox!.execute('pwd', [], {
    cwd: subdir,
  });

  expect(result.exitCode).toBe(0);

  // Normalize path to handle symlinks
  const expectedPath = await fs.realpath(subdirPath);
  expect(result.stdout.trim()).toBe(expectedPath);
});
```

#### 2.3.4 Handle Windows Specifically

Windows doesn't have a `pwd` command. Two options:

**Option A: Skip on Windows**
```typescript
it.skipIf(process.platform === 'win32')('should use workspace as cwd', async () => {
  // ...
});
```

**Option B: Use cross-platform approach**
```typescript
it('should use workspace as cwd', async () => {
  // Use node -e to get cwd cross-platform
  const result = await sandbox!.execute('node', [
    '-e',
    'console.log(process.cwd())',
  ]);

  expect(result.exitCode).toBe(0);

  const expectedPath = await fs.realpath(tempDir);
  // Normalize Windows backslashes
  expect(path.normalize(result.stdout.trim())).toBe(path.normalize(expectedPath));
});
```

### 2.4 Verification Steps

1. Run tests on Linux/WSL:
   ```bash
   pnpm --filter @agentgate/server test test/streaming-executor.test.ts
   pnpm --filter @agentgate/server test test/sandbox/subprocess-provider.test.ts
   ```
   Expected: All tests pass

2. Simulate macOS behavior (if on Linux):
   ```bash
   # Create symlink like macOS
   sudo ln -sf /private/tmp /tmp
   # Run tests
   pnpm --filter @agentgate/server test
   ```

3. Check in CI across platforms:
   ```bash
   gh run watch  # After pushing changes
   ```
   Expected: ubuntu-latest, macos-latest, windows-latest all pass

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/test/streaming-executor.test.ts` | Modified - Use realpath |
| `packages/server/test/sandbox/subprocess-provider.test.ts` | Modified - Use realpath |

---

## Thrust 1-2 Verification Checklist

### Local Verification

- [ ] Contract tests pass after building shared
  ```bash
  pnpm --filter @agentgate/shared build
  pnpm --filter @agentgate/server test test/contract/
  ```

- [ ] Streaming executor tests pass
  ```bash
  pnpm --filter @agentgate/server test test/streaming-executor.test.ts
  ```

- [ ] Subprocess provider tests pass
  ```bash
  pnpm --filter @agentgate/server test test/sandbox/subprocess-provider.test.ts
  ```

- [ ] Full server test suite passes
  ```bash
  pnpm --filter @agentgate/server test
  ```

### CI Verification

- [ ] Push changes and verify CI
  ```bash
  git add -A
  git commit -m "fix: resolve contract and platform-specific test failures"
  git push
  gh run watch
  ```

- [ ] Verify all matrix jobs pass:
  - [ ] Tests (Node 18)
  - [ ] Tests (Node 20)
  - [ ] Tests (Node 22)
  - [ ] Platform Test (ubuntu-latest)
  - [ ] Platform Test (macos-latest)
  - [ ] Platform Test (windows-latest)

---

## Common Pitfalls

### 1. Cached dist directories

If you previously built with errors, clean and rebuild:
```bash
pnpm clean
pnpm build
pnpm test
```

### 2. Import order in tests

Ensure `fs/promises` import is at top of file:
```typescript
// Correct
import * as fs from 'node:fs/promises';

// Wrong - dynamic import may fail
const fs = await import('node:fs/promises');
```

### 3. Windows path separators

Always use `path.join()` and `path.normalize()`:
```typescript
// Correct
const fullPath = path.join(baseDir, subDir);

// Wrong
const fullPath = `${baseDir}/${subDir}`;
```

### 4. Async realpath

`fs.realpath` is async - don't forget `await`:
```typescript
// Correct
const normalized = await fs.realpath(tempDir);

// Wrong - returns Promise
const normalized = fs.realpath(tempDir);
```
