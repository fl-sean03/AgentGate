/**
 * Base Template Loader
 *
 * Abstract base class for template loaders.
 */

import type {
  TemplateLoader,
  TemplateSourceType,
  TemplateSource,
} from '../types.js';

/**
 * Abstract base class for template loaders
 */
export abstract class BaseTemplateLoader implements TemplateLoader {
  abstract sourceType: TemplateSourceType;

  /**
   * Load template files from the source
   * @param source The template source configuration
   * @param targetDir Directory to write files to
   * @returns List of files created
   */
  abstract load(source: TemplateSource, targetDir: string): Promise<string[]>;

  /**
   * Validate that the source configuration is valid for this loader
   */
  protected validateSource(source: TemplateSource): void {
    if (source.type !== this.sourceType) {
      throw new Error(
        `Invalid source type: expected '${this.sourceType}', got '${source.type}'`
      );
    }
  }
}
