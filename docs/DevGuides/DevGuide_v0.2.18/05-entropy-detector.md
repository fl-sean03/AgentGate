# 05: Entropy Detector

This document covers Thrust 4: implementing the entropy-based detection system for high-entropy strings.

---

## Thrust 4: Entropy Detector

### 4.1 Objective

Implement a Shannon entropy-based detector that identifies high-entropy strings likely to be secrets, complementing the regex-based content detector by catching secrets that don't match known patterns.

### 4.2 Background

Shannon entropy measures the randomness of a string. Secrets (API keys, tokens, passwords) typically have high entropy because they're randomly generated. Normal code and text have lower entropy due to language patterns.

Entropy formula: H = -Σ p(x) log₂ p(x)

Where p(x) is the probability of each character in the string.

Example entropy values:
- `"hello"` → ~1.9 bits
- `"password123"` → ~3.2 bits
- `"aB3$kL9mNp"` → ~4.7 bits
- `"8kJh2nXp4qRsT6vW"` → ~5.0 bits

### 4.3 Subtasks

#### 4.3.1 Create Entropy Detector

Create `packages/server/src/security/detectors/entropy-detector.ts`:

**EntropyDetectorOptions Interface:**
- `threshold: number` - Minimum entropy to flag (default 4.5)
- `minLength: number` - Minimum string length to check (default 20)
- `maxLength: number` - Maximum string length to check (default 200)
- `charset?: 'base64' | 'hex' | 'alphanumeric' | 'any'` - Character set filter

**EntropyDetector Class:**

Properties:
- `readonly type = 'entropy'`
- `readonly name = 'High-Entropy String Detector'`
- `readonly description = 'Detects high-entropy strings that may be secrets'`

Methods:

**detect(ctx, options):**
1. Parse and validate options
2. Create regex pattern for potential secrets:
   - `[A-Za-z0-9+/=_-]{minLength,maxLength}`
3. For each file in ctx.files:
   - Skip binary files
   - Read file content
   - Split into lines
   - For each line:
     - Find all potential secret strings
     - For each match:
       - If length within bounds
       - Calculate Shannon entropy
       - If entropy >= threshold
         - Create Finding with WARNING sensitivity
4. Return all findings

**validateOptions(options):**
- threshold must be number between 0 and 8
- minLength must be positive integer
- maxLength must be >= minLength
- charset must be valid enum value if provided

**calculateEntropy(str):**
1. Create frequency map of characters
2. For each unique character:
   - Calculate probability: count / total length
   - Add to sum: -p * log2(p)
3. Return sum (entropy in bits)

**matchesCharset(str, charset):**
- 'base64': only [A-Za-z0-9+/=]
- 'hex': only [0-9a-fA-F]
- 'alphanumeric': only [A-Za-z0-9]
- 'any': any characters

**maskString(str):**
- If length <= 8: return asterisks
- Show first 4 chars + "..." + last 4 chars

#### 4.3.2 Register Entropy Detector

Modify `packages/server/src/security/detectors/registry.ts`:
- Import EntropyDetector
- Register in global registry constructor

#### 4.3.3 Add False Positive Filtering

Add heuristics to reduce false positives:

**isLikelyFalsePositive(str, context):**
- Check if string looks like a UUID (8-4-4-4-12)
- Check if string is all same character repeated
- Check if string is a common encoding (base64 of known values)
- Check if context suggests non-secret (import path, URL, etc.)
- Check if string is a hash of a common word

**Common False Positive Patterns:**
- Base64-encoded common words
- Long variable/function names in camelCase
- UUIDs (despite high entropy)
- Lorem ipsum text
- Repeated patterns (aaaabbbbcccc)

### 4.4 Verification Steps

1. Create test file with high-entropy string (random 32 chars)
2. Verify detector returns finding with correct entropy value
3. Test with low-entropy string (hello world repeated)
4. Verify threshold filtering works (entropy < threshold not flagged)
5. Test minLength/maxLength filtering
6. Verify false positive filtering for UUIDs
7. Test charset filtering with hex-only string
8. Run on real codebase and review findings for false positives

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/detectors/entropy-detector.ts` | Created |
| `packages/server/src/security/detectors/registry.ts` | Modified - register detector |
| `packages/server/src/security/detectors/index.ts` | Modified - export detector |

---

## Entropy Calculation Reference

### Shannon Entropy Formula

```
H(X) = -Σ p(xi) * log2(p(xi))
```

Where:
- H(X) is the entropy in bits
- p(xi) is the probability of character i
- The sum is over all unique characters

### Entropy by Character Set

| Character Set | Max Entropy | Example |
|---------------|-------------|---------|
| Lowercase (26) | 4.7 bits | abcdefgh |
| Mixed case (52) | 5.7 bits | AbCdEfGh |
| Alphanumeric (62) | 5.95 bits | aB3cD4eF |
| Base64 (64) | 6 bits | aB3c+/D= |
| Printable ASCII (95) | 6.6 bits | aB3!@#$% |

### Recommended Thresholds

| Use Case | Threshold | Rationale |
|----------|-----------|-----------|
| Aggressive | 4.0 | Catch more, more false positives |
| Balanced | 4.5 | Good balance for most codebases |
| Conservative | 5.0 | Fewer false positives, may miss some |
| Strict | 5.5 | Only very random strings |

### Example Entropy Values

| String | Entropy | Would Flag (4.5) |
|--------|---------|------------------|
| `helloworld` | 2.5 | No |
| `password123!` | 3.4 | No |
| `MySecretKey123` | 3.6 | No |
| `aB3kL9mNp2qRsT4` | 4.6 | Yes |
| `8kJh2nXp4qRsT6vW` | 5.0 | Yes |
| `sk_live_abc123xyz` | 4.2 | No |

---

## False Positive Mitigation

### UUID Pattern

UUIDs have high entropy but are not secrets:
```
8-4-4-4-12 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Detect and skip UUIDs before entropy calculation.

### Import/Require Paths

Long package names can trigger false positives:
```javascript
import { something } from '@organization/very-long-package-name-here';
```

Check if high-entropy string is within import/require statement.

### URL Paths

Long URLs with random-looking paths:
```
https://cdn.example.com/assets/bundle.a1b2c3d4e5f6.js
```

Check if string is part of a URL pattern.

### Hash Comments

Hash values in comments (SHA, MD5):
```javascript
// SHA256: a1b2c3d4e5f6g7h8i9j0...
```

Check context for hash indicators.

### Configuration Values

Some config values look random but are safe:
```yaml
locale: en_US.UTF-8
timezone: America/Los_Angeles
```

Maintain small allowlist of common config patterns.
