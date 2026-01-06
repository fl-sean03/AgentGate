/**
 * Directory Template Loader
 *
 * Loads templates from a local filesystem directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { TemplateSource, DirectoryTemplateSource } from '../types.js';
import { BaseTemplateLoader } from './base-loader.js';

export class DirectoryTemplateLoader extends BaseTemplateLoader {
  sourceType = 'directory' as const;

  async load(source: TemplateSource, targetDir: string): Promise<string[]> {
    this.validateSource(source);
    const dirSource = source as DirectoryTemplateSource;

    const createdFiles: string[] = [];

    // Check source directory exists
    try {
      await fs.access(dirSource.path);
    } catch {
      throw new Error(`Template directory not found: ${dirSource.path}`);
    }

    // Create target directory
    await fs.mkdir(targetDir, { recursive: true });

    // Copy directory recursively
    await this.copyDir(dirSource.path, targetDir, createdFiles);

    return createdFiles;
  }

  /**
   * Recursively copy a directory
   */
  private async copyDir(
    src: string,
    dest: string,
    createdFiles: string[],
    basePath: string = ''
  ): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        // Skip .git directories
        if (entry.name === '.git') {
          continue;
        }
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDir(srcPath, destPath, createdFiles, relativePath);
      } else {
        await fs.copyFile(srcPath, destPath);
        createdFiles.push(relativePath);
      }
    }
  }
}

export const directoryLoader = new DirectoryTemplateLoader();
