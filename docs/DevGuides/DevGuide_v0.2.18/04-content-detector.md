# 04: Content Detector

This document covers Thrust 3: implementing the content-based secret detection system.

---

## Thrust 3: Content Detector

### 3.1 Objective

Implement a regex-based content detector that scans file contents for known secret patterns (API keys, tokens, private keys, connection strings) with a comprehensive built-in pattern library.

### 3.2 Background

The content detector is the primary line of defense against hardcoded secrets. It:
- Scans actual file contents, not just filenames
- Uses regex patterns for known secret formats
- Skips binary files and large files for performance
- Reports line numbers for easy remediation

### 3.3 Subtasks

#### 3.3.1 Create Detector Interface

Create `packages/server/src/security/detectors/types.ts`:

**Finding Interface:**
- `ruleId: string` - Unique identifier for finding type
- `message: string` - Human-readable description
- `file: string` - Relative path to file
- `line?: number` - Line number (1-indexed)
- `column?: number` - Column number (1-indexed)
- `match?: string` - Masked value of the match
- `sensitivity: SensitivityLevel` - Severity of finding
- `detector: string` - Which detector produced this
- `metadata?: Record<string, unknown>` - Additional context

**DetectorContext Interface:**
- `workspaceDir: string` - Workspace directory
- `files: string[]` - Files to scan (pre-filtered by excludes)
- `policy: ResolvedSecurityPolicy` - Security policy in effect
- `allowlist: Set<string>` - Allowlisted patterns for quick lookup
- `signal?: AbortSignal` - For cancellation

**Detector Interface:**
- `readonly type: string` - Unique identifier
- `readonly name: string` - Human-readable name
- `readonly description: string` - What it detects
- `detect(ctx: DetectorContext, options: Record<string, unknown>): Promise<Finding[]>`
- `validateOptions(options: Record<string, unknown>): ValidationResult`

**ValidationResult Interface:**
- `valid: boolean`
- `errors: string[]`

#### 3.3.2 Create Pattern Library

Create `packages/server/src/security/detectors/patterns.ts`:

**SecretPattern Interface:**
- `id: string` - Unique pattern ID
- `pattern: string` - Regex pattern string
- `description: string` - Human-readable description
- `sensitivity?: SensitivityLevel` - Override default sensitivity

**BUILTIN_SECRET_PATTERNS array with patterns for:**

AWS:
- `aws-access-key-id`: `AKIA[0-9A-Z]{16}`
- `aws-secret-key`: `(?<![A-Za-z0-9/+])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])`

GitHub:
- `github-pat`: `ghp_[A-Za-z0-9]{36}`
- `github-oauth`: `gho_[A-Za-z0-9]{36}`
- `github-user-to-server`: `ghu_[A-Za-z0-9]{36}`
- `github-refresh`: `ghr_[A-Za-z0-9]{36}`
- `github-fine-grained`: `github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}`

Stripe:
- `stripe-publishable`: `pk_(?:live|test)_[A-Za-z0-9]{24,}`
- `stripe-secret`: `sk_(?:live|test)_[A-Za-z0-9]{24,}`
- `stripe-restricted`: `rk_(?:live|test)_[A-Za-z0-9]{24,}`

Slack:
- `slack-token`: `xox[baprs]-[0-9a-zA-Z-]{10,}`
- `slack-webhook`: `https://hooks\.slack\.com/services/T[A-Z0-9]{8}/B[A-Z0-9]{8,}/[a-zA-Z0-9]{24}`

Private Keys:
- `rsa-private-key`: `-----BEGIN RSA PRIVATE KEY-----`
- `ec-private-key`: `-----BEGIN EC PRIVATE KEY-----`
- `openssh-private-key`: `-----BEGIN OPENSSH PRIVATE KEY-----`
- `pgp-private-key`: `-----BEGIN PGP PRIVATE KEY BLOCK-----`
- `dsa-private-key`: `-----BEGIN DSA PRIVATE KEY-----`

Google:
- `google-api-key`: `AIza[0-9A-Za-z\-_]{35}`
- `google-oauth-client`: `[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com`

Database:
- `postgres-url`: `postgres(?:ql)?://[^:]+:[^@]+@[^/]+/\w+`
- `mongodb-url`: `mongodb(?:\+srv)?://[^:]+:[^@]+@[^/]+`
- `redis-url`: `redis://[^:]+:[^@]+@[^/]+`
- `mysql-url`: `mysql://[^:]+:[^@]+@[^/]+`

JWT:
- `jwt`: `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`

NPM:
- `npm-token`: `npm_[A-Za-z0-9]{36}`

Generic:
- `generic-api-key`: `(?:api[_-]?key|apikey|auth[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}["']?`
- `generic-secret`: `(?:secret|password|passwd|pwd)\s*[=:]\s*["'][^"']{8,}["']`

**compilePatterns function:**
- Takes array of SecretPattern
- Returns array with compiled RegExp objects
- Handles invalid patterns gracefully (log warning, skip)

#### 3.3.3 Implement Content Detector

Create `packages/server/src/security/detectors/content-detector.ts`:

**ContentDetectorOptions Interface:**
- `rules: SecretPattern[]` - Patterns to scan for
- `maxFileSizeBytes?: number` - Skip files larger than this (default 1MB)
- `binaryExtensions?: string[]` - Extensions to treat as binary

**DEFAULT_BINARY_EXTENSIONS array:**
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.webp`, `.svg`, `.bmp`
- Fonts: `.woff`, `.woff2`, `.ttf`, `.eot`, `.otf`
- Archives: `.zip`, `.tar`, `.gz`, `.bz2`, `.7z`, `.rar`
- Executables: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`
- Documents: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`
- Media: `.mp3`, `.mp4`, `.wav`, `.avi`, `.mov`

**ContentDetector Class:**

Properties:
- `readonly type = 'content'`
- `readonly name = 'Content-Based Secret Detector'`
- `readonly description = 'Scans file contents for hardcoded secrets'`

Methods:

**detect(ctx, options):**
1. Merge options with defaults
2. Compile regex patterns
3. For each file in ctx.files:
   - Skip if binary extension
   - Skip if file size > maxFileSizeBytes
   - Read file content
   - For each pattern:
     - Find all matches with matchAll
     - For each match:
       - Calculate line number
       - Create Finding with masked value
4. Return all findings

**validateOptions(options):**
- Verify rules is array
- Verify each rule has id and pattern
- Verify patterns are valid regexes
- Return validation result

**isBinaryFile(file, extensions):**
- Extract extension from filename
- Check against binary extensions list
- Return boolean

**readFileContent(path, maxSize):**
- Read file with fs.promises.readFile
- If size exceeds maxSize, return null
- Return content string

**maskSecret(value):**
- If length <= 8: return all asterisks
- Otherwise: show first 4, asterisks, last 4
- Example: `sk_live_****...****abcd`

**getLineNumber(content, matchIndex):**
- Count newlines before match index
- Return line number (1-indexed)

#### 3.3.4 Create Detector Registry

Create `packages/server/src/security/detectors/registry.ts`:

**DetectorRegistry Class:**

Properties:
- `private detectors: Map<string, Detector>`

Constructor:
- Initialize empty map

Methods:

**register(detector):**
- Log if overwriting existing
- Add to map with detector.type as key

**get(type): Detector | undefined:**
- Return detector from map

**all(): Detector[]:**
- Return array of all registered detectors

**has(type): boolean:**
- Check if type exists in map

**Global Instance:**
- Export `detectorRegistry` singleton
- Register ContentDetector in constructor

#### 3.3.5 Create Detectors Index

Create `packages/server/src/security/detectors/index.ts`:
- Export Detector, Finding, DetectorContext types
- Export ContentDetector class
- Export detectorRegistry singleton
- Export BUILTIN_SECRET_PATTERNS

### 3.4 Verification Steps

1. Create test file with known AWS key: `AKIAIOSFODNN7EXAMPLE`
2. Run ContentDetector and verify finding is returned
3. Test with masked example: `AKIAXXXXXXXXXXXXXXXX` (should not match)
4. Test binary file skipping with .png file
5. Test large file skipping (> 1MB)
6. Verify line numbers are correct
7. Test pattern validation with invalid regex
8. Verify masked output doesn't expose full secret

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/detectors/types.ts` | Created |
| `packages/server/src/security/detectors/patterns.ts` | Created |
| `packages/server/src/security/detectors/content-detector.ts` | Created |
| `packages/server/src/security/detectors/registry.ts` | Created |
| `packages/server/src/security/detectors/index.ts` | Created |
| `packages/server/src/security/index.ts` | Modified - export detectors |

---

## Pattern Reference

### AWS Patterns

| Pattern ID | Description | Example |
|------------|-------------|---------|
| aws-access-key-id | AWS Access Key ID | AKIAIOSFODNN7EXAMPLE |
| aws-secret-key | AWS Secret Access Key | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |

### GitHub Patterns

| Pattern ID | Description | Example |
|------------|-------------|---------|
| github-pat | Personal Access Token | ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
| github-oauth | OAuth Token | gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |

### Stripe Patterns

| Pattern ID | Description | Example |
|------------|-------------|---------|
| stripe-secret | Secret Key | sk_test_EXAMPLE_NOT_REAL |
| stripe-publishable | Publishable Key | pk_test_EXAMPLE_NOT_REAL |

### Database URL Patterns

| Pattern ID | Description | Example |
|------------|-------------|---------|
| postgres-url | PostgreSQL Connection | postgres://user:pass@host/db |
| mongodb-url | MongoDB Connection | mongodb://user:pass@host/db |

---

## Performance Considerations

### File Size Limits

Default max file size: 1MB

Files larger than this are skipped because:
- Unlikely to contain relevant secrets
- Scanning is O(n*m) where n=file size, m=patterns
- Memory usage for large files

### Binary File Detection

Binary files are detected by extension, not content:
- Faster than reading file to check
- False positives rare (who names a text file .png?)
- Can be overridden in detector options

### Pattern Compilation

Patterns are compiled once per scan:
- Compiled RegExp objects cached
- Significant speedup for many files
- Invalid patterns logged and skipped
