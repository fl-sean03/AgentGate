/**
 * Inline Template Loader
 *
 * Loads templates from embedded file content.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { TemplateSource, InlineTemplateSource } from '../types.js';
import { BaseTemplateLoader } from './base-loader.js';

export class InlineTemplateLoader extends BaseTemplateLoader {
  sourceType = 'inline' as const;

  async load(source: TemplateSource, targetDir: string): Promise<string[]> {
    this.validateSource(source);
    const inlineSource = source as InlineTemplateSource;

    const createdFiles: string[] = [];

    // Create the target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });

    // Write each file
    for (const [filename, content] of Object.entries(inlineSource.files)) {
      const fullPath = path.join(targetDir, filename);

      // Create parent directories if needed
      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Write the file
      await fs.writeFile(fullPath, content, 'utf-8');
      createdFiles.push(filename);
    }

    return createdFiles;
  }
}

export const inlineLoader = new InlineTemplateLoader();
