/**
 * Template Loaders Index
 *
 * Exports all template loaders and provides a factory function.
 */

export { BaseTemplateLoader } from './base-loader.js';
export { InlineTemplateLoader, inlineLoader } from './inline-loader.js';
export { DirectoryTemplateLoader, directoryLoader } from './directory-loader.js';
export { GitTemplateLoader, gitLoader } from './git-loader.js';
export { UrlTemplateLoader, urlLoader } from './url-loader.js';

import type { TemplateLoader, TemplateSourceType } from '../types.js';
import { inlineLoader } from './inline-loader.js';
import { directoryLoader } from './directory-loader.js';
import { gitLoader } from './git-loader.js';
import { urlLoader } from './url-loader.js';

/**
 * Map of source types to their loaders
 */
const loaders: Record<TemplateSourceType, TemplateLoader> = {
  inline: inlineLoader,
  directory: directoryLoader,
  git: gitLoader,
  url: urlLoader,
};

/**
 * Get a loader for a specific source type
 */
export function getLoader(sourceType: TemplateSourceType): TemplateLoader {
  const loader = loaders[sourceType];
  if (!loader) {
    throw new Error(`Unknown template source type: ${sourceType}`);
  }
  return loader;
}

/**
 * Register a custom loader
 */
export function registerLoader(loader: TemplateLoader): void {
  loaders[loader.sourceType] = loader;
}
