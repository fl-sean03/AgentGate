import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEmbeddedStandards } from './defaults.js';

/**
 * Cached standards content to avoid repeated file reads
 */
let cachedStandards: string | null = null;
let cacheInitialized = false;

/**
 * Search paths for AGENTS.md in priority order
 */
const STANDARDS_SEARCH_PATHS = [
  '.agentgate/AGENTS.md',
  'docs/AGENTS.md',
  'AGENTS.md',
];

/**
 * Loads engineering standards for agent system prompts.
 *
 * Searches for AGENTS.md in the workspace in this order:
 * 1. .agentgate/AGENTS.md
 * 2. docs/AGENTS.md
 * 3. AGENTS.md (workspace root)
 *
 * Falls back to embedded defaults if not found.
 * Results are cached after first load.
 *
 * @param workspacePath - Optional workspace path to search in
 * @returns The engineering standards content, or null if not available
 */
export function loadEngineeringStandards(workspacePath?: string): string | null {
  // Return cached result if available
  if (cacheInitialized) {
    return cachedStandards;
  }

  // Try to find AGENTS.md in workspace
  if (workspacePath) {
    for (const searchPath of STANDARDS_SEARCH_PATHS) {
      const fullPath = join(workspacePath, searchPath);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          cachedStandards = content;
          cacheInitialized = true;
          return content;
        } catch (error) {
          // If we can't read it, continue to next path
          continue;
        }
      }
    }
  }

  // Fall back to embedded defaults
  cachedStandards = getEmbeddedStandards();
  cacheInitialized = true;
  return cachedStandards;
}

/**
 * Clears the cached standards (useful for testing)
 */
export function clearStandardsCache(): void {
  cachedStandards = null;
  cacheInitialized = false;
}
