# DevGuide v0.2.2: Implementation

## Thrust 1: Fix TypeScript Error

### 1.1 Objective
Resolve the TypeScript compilation error in opencode-driver.ts.

### 1.2 Background
The OpenCode SDK returns message objects with a `time` property that can have two shapes:
- `{ created: number; completed?: number }` - completed is optional
- `{ created: number }` - no completed property

TypeScript's union type checking requires explicit narrowing before accessing optional properties.

### 1.3 Subtasks

#### 1.3.1 Fix Type Narrowing
In `src/agent/opencode-driver.ts`, line 280, the code accesses `lastMessage?.info?.time?.completed` without checking if the `time` object has the `completed` property in its type.

Change the completion check to use a proper type guard or inline check that TypeScript can understand.

The fix should check if `completed` exists as a property before comparing it to `null`.

### 1.4 Verification Steps
1. Run `pnpm typecheck`
2. Expect: No errors

### 1.5 Files Modified
| File | Action |
|------|--------|
| `src/agent/opencode-driver.ts` | Modified line ~280 |

---

## Thrust 2: Fix Unused Imports

### 2.1 Objective
Remove all unused import statements flagged by ESLint.

### 2.2 Subtasks

#### 2.2.1 claude-agent-sdk-driver.ts
Remove `Options` and `SDKMessage` from the import on line 7.

#### 2.2.2 openai-codex-driver.ts
Remove `ThreadEvent` and `Usage` from the import on line 8.

#### 2.2.3 sdk-hooks.ts
Remove `HookJSONOutput` from the import on line 12.

#### 2.2.4 claude-code-driver.ts
Remove the unused `killed` variable declaration on line 117.

### 2.3 Verification Steps
1. Run `pnpm lint 2>&1 | grep "is defined but never used"`
2. Expect: No output (no unused variables)

### 2.4 Files Modified
| File | Action |
|------|--------|
| `src/agent/claude-agent-sdk-driver.ts` | Modified import |
| `src/agent/openai-codex-driver.ts` | Modified import |
| `src/agent/sdk-hooks.ts` | Modified import |
| `src/agent/claude-code-driver.ts` | Removed variable |

---

## Thrust 3: Fix require-await

### 3.1 Objective
Address all async functions that don't contain await expressions.

### 3.2 Background
The `isAvailable()` methods across drivers are async but perform synchronous SDK availability checks. We have two options:
1. Remove `async` and return values directly
2. Keep `async` but return `Promise.resolve(value)` explicitly

Option 1 is preferred when the method signature allows it. However, since these methods implement an interface that expects `Promise<boolean>`, we should keep `async` and ensure the return is clear.

### 3.3 Subtasks

#### 3.3.1 claude-agent-sdk-driver.ts:71
The `isAvailable()` method uses try/catch around a dynamic import. The import IS async, but ESLint doesn't recognize it. This is a false positive - add an eslint-disable comment for this specific line.

#### 3.3.2 claude-code-driver.ts:47
Similar to above - uses dynamic import. Add eslint-disable comment.

#### 3.3.3 openai-agents-driver.ts:169
Similar pattern - add eslint-disable comment.

#### 3.3.4 openai-codex-driver.ts:74
Similar pattern - add eslint-disable comment.

#### 3.3.5 opencode-driver.ts:400
The `dispose()` method closes a server synchronously. Since it implements `Promise<void>` interface, convert the method body to explicitly return `Promise.resolve()`.

#### 3.3.6 sdk-hooks.ts:39,50,71,95
These hook functions are async by design but may not always await. They're callbacks that must be async per the SDK interface. Add eslint-disable comments with explanation.

### 3.4 Verification Steps
1. Run `pnpm lint 2>&1 | grep "require-await"`
2. Expect: No output

### 3.5 Files Modified
| File | Action |
|------|--------|
| `src/agent/claude-agent-sdk-driver.ts` | Add eslint-disable |
| `src/agent/claude-code-driver.ts` | Add eslint-disable |
| `src/agent/openai-agents-driver.ts` | Add eslint-disable |
| `src/agent/openai-codex-driver.ts` | Add eslint-disable |
| `src/agent/opencode-driver.ts` | Return Promise.resolve() |
| `src/agent/sdk-hooks.ts` | Add eslint-disable |

---

## Thrust 4: Fix Type Safety

### 4.1 Objective
Eliminate unsafe any access patterns in sdk-message-parser.ts.

### 4.2 Background
The Claude SDK returns message content with various types (text, tool_use, tool_result). The current code iterates over these without proper type guards.

### 4.3 Subtasks

#### 4.3.1 Define Content Block Types
At the top of `sdk-message-parser.ts`, define proper interfaces for the expected content block shapes:
- TextContentBlock
- ToolUseContentBlock
- ToolResultContentBlock

#### 4.3.2 Add Type Guards
Create type guard functions:
- `isTextBlock(block: unknown): block is TextContentBlock`
- `isToolUseBlock(block: unknown): block is ToolUseContentBlock`
- `isToolResultBlock(block: unknown): block is ToolResultContentBlock`

#### 4.3.3 Update extractToolCalls (lines 106-112)
Use type guards when iterating over content blocks instead of casting to any.

#### 4.3.4 Update extractToolResults (lines 151-158)
Use type guards when iterating over content blocks.

#### 4.3.5 Fix lines 207-209
These lines extract text from messages. Add proper type checking.

### 4.4 Verification Steps
1. Run `pnpm lint 2>&1 | grep "no-unsafe"`
2. Expect: No output
3. Run `pnpm test`
4. Expect: All tests pass

### 4.5 Files Modified
| File | Action |
|------|--------|
| `src/agent/sdk-message-parser.ts` | Add types and guards |

---

## Thrust 5: Fix Nullish Coalescing

### 5.1 Objective
Replace logical OR with nullish coalescing operator where appropriate.

### 5.2 Subtasks

#### 5.2.1 opencode-driver.ts Line 142
Change `process.env.OPENCODE_PROVIDER || 'anthropic'` to use `??`.

#### 5.2.2 opencode-driver.ts Line 205
Change `process.env.OPENCODE_PROVIDER || 'openai'` to use `??`.

#### 5.2.3 opencode-driver.ts Line 210
Change `process.env.OPENAI_API_MODEL || 'gpt-4o'` to use `??`.

#### 5.2.4 opencode-driver.ts Line 212
Change `process.env.CLAUDE_MODEL || '...'` to use `??`.

#### 5.2.5 opencode-driver.ts Line 262
Change `messagesCheck.data || []` to use `??`.

#### 5.2.6 openai-agents-driver.ts Line 261
Change any `||` to `??` for default values.

### 5.3 Verification Steps
1. Run `pnpm lint 2>&1 | grep "prefer-nullish-coalescing"`
2. Expect: No output

### 5.4 Files Modified
| File | Action |
|------|--------|
| `src/agent/opencode-driver.ts` | Replace || with ?? |
| `src/agent/openai-agents-driver.ts` | Replace || with ?? |

---

## Thrust 6: Add Missing Return Types

### 6.1 Objective
Add explicit return type to function missing annotation.

### 6.2 Subtasks

#### 6.2.1 openai-agents-driver.ts Line 60
Add explicit return type to the helper function.

### 6.3 Verification Steps
1. Run `pnpm lint 2>&1 | grep "explicit-function-return-type"`
2. Expect: No output

### 6.4 Files Modified
| File | Action |
|------|--------|
| `src/agent/openai-agents-driver.ts` | Add return type |

---

## Thrust 7: Update Package Version

### 7.1 Objective
Update package.json version to 0.2.2.

### 7.2 Subtasks

#### 7.2.1 Update package.json
Change `"version": "0.1.0"` to `"version": "0.2.2"`.

### 7.3 Verification Steps
1. Run `grep '"version"' package.json`
2. Expect: `"version": "0.2.2",`

### 7.4 Files Modified
| File | Action |
|------|--------|
| `package.json` | Update version |

---

## Thrust 8: Final Validation

### 8.1 Objective
Run all validation checks and confirm zero errors.

### 8.2 Subtasks

#### 8.2.1 TypeScript Check
Run `pnpm typecheck` and confirm zero errors.

#### 8.2.2 Lint Check
Run `pnpm lint` and confirm zero errors and zero warnings.

#### 8.2.3 Test Suite
Run `pnpm test` and confirm all 35 tests pass.

#### 8.2.4 Build Check
Run `pnpm build` and confirm successful compilation.

### 8.3 Verification Steps
1. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
2. Expect: All commands succeed with exit code 0

### 8.4 Files Modified
None - validation only.

---

## Implementation Order

Execute thrusts in this order for safest progression:

1. **Thrust 1** - Fix TypeScript error (unblocks compilation)
2. **Thrust 2** - Fix unused imports (safe deletions)
3. **Thrust 5** - Fix nullish coalescing (simple replacements)
4. **Thrust 6** - Add return types (simple additions)
5. **Thrust 3** - Fix require-await (eslint-disable comments)
6. **Thrust 4** - Fix type safety (most complex - needs type guards)
7. **Thrust 7** - Update version (after all fixes)
8. **Thrust 8** - Final validation
