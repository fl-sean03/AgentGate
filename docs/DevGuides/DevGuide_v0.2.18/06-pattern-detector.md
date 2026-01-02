# 06: Pattern Detector

This document covers Thrust 5: implementing the file pattern detector and gitignore-aware detection.

---

## Thrust 5: Pattern Detector

### 5.1 Objective

Implement file pattern-based detection that identifies sensitive files by their names/paths (like `.env`, `credentials.json`) and integrates with gitignore to detect untracked sensitive files.

### 5.2 Background

File pattern detection is the legacy approach (what currently exists) but still valuable because:
- Fast - no file content reading needed
- Catches files before content scanning
- Works on files too large for content scanning
- Provides defense in depth

The gitignore detector adds awareness of which files are version-controlled, enabling policies like "warn if sensitive file is tracked by git."

### 5.3 Subtasks

#### 5.3.1 Implement Pattern Detector

Create `packages/server/src/security/detectors/pattern-detector.ts`:

**PatternDetectorOptions Interface:**
- `patterns: string[]` - Glob patterns to match (e.g., `**/.env`, `**/credentials.json`)
- `excludePatterns?: string[]` - Patterns to exclude from matching

**PatternDetector Class:**

Properties:
- `readonly type = 'pattern'`
- `readonly name = 'File Pattern Detector'`
- `readonly description = 'Detects sensitive files by filename patterns'`

Methods:

**detect(ctx, options):**
1. Parse and validate options
2. Use fast-glob to find matching files:
   - cwd: ctx.workspaceDir
   - patterns: options.patterns
   - ignore: options.excludePatterns + ctx.policy.excludes
   - dot: true
   - onlyFiles: true
3. For each matched file:
   - Create Finding with:
     - ruleId: pattern that matched
     - message: "Sensitive file detected: {filename}"
     - file: relative path
     - sensitivity: from detector config
     - detector: 'pattern'
4. Return all findings

**validateOptions(options):**
- patterns must be non-empty array
- each pattern must be non-empty string
- exclude patterns (if present) must be array of strings

**matchesPattern(file, pattern):**
- Use minimatch or picomatch for glob matching
- Return boolean

#### 5.3.2 Implement Gitignore Detector

Create `packages/server/src/security/detectors/gitignore-detector.ts`:

**GitignoreDetectorOptions Interface:**
- `treatAs: 'info' | 'warning' | 'sensitive'` - How to treat gitignored files
- `warnIfTracked: boolean` - Warn if sensitive file is NOT gitignored (tracked)
- `sensitivePatterns: string[]` - Patterns considered sensitive

**GitignoreDetector Class:**

Properties:
- `readonly type = 'gitignore'`
- `readonly name = 'Gitignore-Aware Detector'`
- `readonly description = 'Detects gitignore status of sensitive files'`

Methods:

**detect(ctx, options):**
1. Parse .gitignore file from workspace
2. For each file in ctx.files:
   - Check if file matches any sensitive pattern
   - If yes:
     - Check if file is gitignored
     - If gitignored and treatAs specified: create Finding (informational)
     - If NOT gitignored and warnIfTracked: create Finding (warning/sensitive)
3. Return findings

**parseGitignore(workspaceDir):**
1. Read .gitignore from workspace root
2. Parse patterns (handling comments, negations)
3. Return function that checks if path is ignored

**isIgnored(path, ignorePatterns):**
- Check path against parsed gitignore patterns
- Return boolean

**validateOptions(options):**
- treatAs must be valid enum
- sensitivePatterns must be array if present

#### 5.3.3 Register Pattern Detectors

Modify `packages/server/src/security/detectors/registry.ts`:
- Import PatternDetector and GitignoreDetector
- Register both in global registry constructor

#### 5.3.4 Export from Index

Modify `packages/server/src/security/detectors/index.ts`:
- Export PatternDetector
- Export GitignoreDetector

### 5.4 Verification Steps

1. Create test workspace with `.env` file
2. Run PatternDetector with `**/.env` pattern
3. Verify finding is returned with correct file path
4. Test with excluded pattern (should not match)
5. Test GitignoreDetector:
   - Create .gitignore with `.env`
   - Verify `.env` is detected as gitignored
6. Test warnIfTracked with tracked sensitive file
7. Verify gitignore pattern parsing handles:
   - Comments (#)
   - Negations (!)
   - Directory patterns (dir/)
   - Wildcards (*.log)

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/detectors/pattern-detector.ts` | Created |
| `packages/server/src/security/detectors/gitignore-detector.ts` | Created |
| `packages/server/src/security/detectors/registry.ts` | Modified - register detectors |
| `packages/server/src/security/detectors/index.ts` | Modified - export detectors |

---

## Pattern Syntax Reference

### Glob Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `**/.env` | .env in any directory | src/.env, config/.env |
| `*.pem` | .pem files in root | key.pem |
| `**/*.pem` | .pem files anywhere | certs/server.pem |
| `config/*.json` | JSON in config/ | config/db.json |
| `**/secret*` | Files starting with "secret" | data/secrets.txt |
| `!**.example` | Negation (exclude) | .env.example |

### Default Sensitive Patterns

```
**/.env
**/.env.*
**/credentials.json
**/credentials.yaml
**/service-account*.json
**/*.pem
**/*.key
**/id_rsa*
**/id_ed25519*
**/id_dsa*
**/.npmrc
**/.pypirc
**/secrets.*
**/private.*
```

### Gitignore Syntax

| Pattern | Meaning |
|---------|---------|
| `.env` | Match .env in any directory |
| `/.env` | Match .env only in root |
| `*.log` | Match any .log file |
| `logs/` | Match directory named logs |
| `!important.log` | Don't ignore important.log |
| `# comment` | Comment line |
| `\#file` | File named #file (escaped) |

---

## Detection Logic

### Pattern Detector Flow

```
1. Get patterns from options
2. Get exclude patterns from options + policy
3. Run fast-glob with patterns
4. For each match:
   a. Determine which pattern matched
   b. Create Finding
5. Return findings
```

### Gitignore Detector Flow

```
1. Parse .gitignore file
2. Get sensitive file patterns
3. For each file in scan list:
   a. Does file match sensitive pattern?
   b. If no, skip
   c. If yes:
      - Is file gitignored?
      - If gitignored: INFO finding (file is safe)
      - If NOT gitignored: WARNING finding (file tracked!)
4. Return findings
```

### Combination Strategy

Both detectors run independently:
- PatternDetector catches sensitive files regardless of git status
- GitignoreDetector adds git-awareness layer

A file can have findings from both:
- PatternDetector: "Sensitive file detected: .env"
- GitignoreDetector: "Sensitive file is tracked by git: .env" (if not ignored)

---

## Performance Notes

### Pattern Detector

Very fast because:
- Uses fast-glob which is optimized
- No file content reading
- Single glob operation per scan

### Gitignore Detector

Moderate performance:
- Reads .gitignore once
- Checks each file against patterns
- More files = more checks

Optimization:
- Cache parsed gitignore patterns
- Early exit if file doesn't match any sensitive pattern
