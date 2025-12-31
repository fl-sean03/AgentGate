import { resolve, relative, join } from 'node:path';
import { stat } from 'node:fs/promises';
import fg from 'fast-glob';
import type {
  PathPolicy,
  ValidationResult,
  PathViolation,
  Workspace,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('path-policy');

/**
 * Check if a path is within the root directory
 * Handles symlinks and relative paths
 */
export function isPathWithinRoot(path: string, root: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedRoot = resolve(root);

  // Ensure root ends with separator for proper prefix matching
  const normalizedRoot = resolvedRoot.endsWith('/')
    ? resolvedRoot
    : `${resolvedRoot}/`;

  // Path is within root if it equals root or starts with root/
  return (
    resolvedPath === resolvedRoot || resolvedPath.startsWith(normalizedRoot)
  );
}

/**
 * Check if a path is allowed by the policy
 */
export function isPathAllowed(path: string, policy: PathPolicy): boolean {
  const resolvedPath = resolve(path);
  const rootPath = resolve(policy.rootPath);

  // Must be within root
  if (!isPathWithinRoot(resolvedPath, rootPath)) {
    return false;
  }

  // Get relative path for pattern matching
  const relativePath = relative(rootPath, resolvedPath);

  // Check against forbidden patterns
  for (const pattern of policy.forbiddenPatterns) {
    if (matchesPattern(relativePath, pattern)) {
      return false;
    }
  }

  // If allowedPaths is empty, all paths within root are allowed
  if (policy.allowedPaths.length === 0) {
    return true;
  }

  // Check if path is in allowed paths
  for (const allowed of policy.allowedPaths) {
    const allowedResolved = resolve(rootPath, allowed);
    if (
      resolvedPath === allowedResolved ||
      resolvedPath.startsWith(`${allowedResolved}/`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Match a path against a glob pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Use fast-glob's pattern matching via minimatch-style patterns
  const patterns = fg.isDynamicPattern(pattern) ? [pattern] : [`**/${pattern}`];

  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, '/');

  for (const p of patterns) {
    // Simple glob matching for common patterns
    if (simpleMatch(normalizedPath, p)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob pattern matching
 */
function simpleMatch(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\./g, '\\.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Find files matching forbidden patterns
 */
export async function findForbiddenFiles(
  root: string,
  patterns: string[]
): Promise<string[]> {
  if (patterns.length === 0) {
    return [];
  }

  const resolvedRoot = resolve(root);

  try {
    const matches = await fg(patterns, {
      cwd: resolvedRoot,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    return matches.map((m) => join(resolvedRoot, m));
  } catch (error) {
    log.warn({ root, patterns, error }, 'Error finding forbidden files');
    return [];
  }
}

/**
 * Validate a workspace against its path policy
 */
export async function validateWorkspace(
  workspace: Workspace,
  policy?: PathPolicy
): Promise<ValidationResult> {
  const violations: PathViolation[] = [];
  const rootPath = resolve(workspace.rootPath);

  // Use provided policy or create a default one
  const effectivePolicy: PathPolicy = policy ?? {
    rootPath: workspace.rootPath,
    allowedPaths: [],
    forbiddenPatterns: [
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*.pem',
      '**/*.key',
      '**/credentials.json',
      '**/service-account*.json',
    ],
    maxFileSize: 100 * 1024 * 1024, // 100MB default
  };

  // Find forbidden files
  const forbiddenFiles = await findForbiddenFiles(
    rootPath,
    effectivePolicy.forbiddenPatterns
  );

  for (const file of forbiddenFiles) {
    violations.push({
      path: file,
      reason: 'forbidden_pattern',
      details: `File matches forbidden pattern`,
    });
  }

  // Check for files exceeding max size
  if (effectivePolicy.maxFileSize > 0) {
    try {
      const allFiles = await fg('**/*', {
        cwd: rootPath,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      for (const file of allFiles) {
        const filePath = join(rootPath, file);
        try {
          const stats = await stat(filePath);
          if (stats.size > effectivePolicy.maxFileSize) {
            violations.push({
              path: filePath,
              reason: 'file_too_large',
              details: `File size ${stats.size} exceeds max ${effectivePolicy.maxFileSize}`,
            });
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch (error) {
      log.warn({ rootPath, error }, 'Error checking file sizes');
    }
  }

  const result: ValidationResult = {
    valid: violations.length === 0,
    violations,
  };

  if (!result.valid) {
    log.warn(
      { workspaceId: workspace.id, violationCount: violations.length },
      'Workspace validation failed'
    );
  }

  return result;
}

/**
 * Create a PathPolicy from execution policies
 */
export function createPathPolicy(
  rootPath: string,
  options: {
    allowedPaths?: string[];
    forbiddenPatterns?: string[];
    maxDiskMb?: number;
  } = {}
): PathPolicy {
  return {
    rootPath,
    allowedPaths: options.allowedPaths ?? [],
    forbiddenPatterns: options.forbiddenPatterns ?? [
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*.pem',
      '**/*.key',
      '**/credentials.json',
      '**/service-account*.json',
    ],
    maxFileSize: (options.maxDiskMb ?? 100) * 1024 * 1024,
  };
}
