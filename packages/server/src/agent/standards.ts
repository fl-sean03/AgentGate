import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cached standards content per workspace path
 * Uses workspace path as key to avoid cross-workspace caching issues
 */
const standardsCache = new Map<string, string | null>();

/**
 * Search paths for AGENTS.md in priority order
 */
const STANDARDS_SEARCH_PATHS = [
  '.agentgate/AGENTS.md',
  'AGENTS.md',
];

/**
 * Loads engineering standards for agent system prompts.
 *
 * Searches for AGENTS.md in the workspace in this order:
 * 1. .agentgate/AGENTS.md (project-specific)
 * 2. AGENTS.md (workspace root)
 *
 * Returns null if no AGENTS.md is found in the workspace.
 * This respects the workspace's own standards and doesn't override
 * with embedded defaults.
 *
 * Results are cached per workspace path to avoid repeated file reads.
 *
 * @param workspacePath - Workspace path to search in (required)
 * @returns The engineering standards content, or null if not found
 */
export function loadEngineeringStandards(workspacePath?: string): string | null {
  // If no workspace path, return null (no fallback to embedded)
  if (!workspacePath) {
    return null;
  }

  // Return cached result if available for this workspace
  if (standardsCache.has(workspacePath)) {
    return standardsCache.get(workspacePath) ?? null;
  }

  // Try to find AGENTS.md in workspace
  for (const searchPath of STANDARDS_SEARCH_PATHS) {
    const fullPath = join(workspacePath, searchPath);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        standardsCache.set(workspacePath, content);
        return content;
      } catch {
        // If we can't read it, continue to next path
        continue;
      }
    }
  }

  // No AGENTS.md found - don't use embedded defaults
  // This respects the workspace's own configuration
  standardsCache.set(workspacePath, null);
  return null;
}

/**
 * Clears the cached standards (useful for testing)
 */
export function clearStandardsCache(): void {
  standardsCache.clear();
}
