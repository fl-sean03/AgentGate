/**
 * URL Template Loader
 *
 * Loads templates from a URL (tar.gz or zip archive).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import type { TemplateSource, UrlTemplateSource } from '../types.js';
import { BaseTemplateLoader } from './base-loader.js';
import { directoryLoader } from './directory-loader.js';

export class UrlTemplateLoader extends BaseTemplateLoader {
  sourceType = 'url' as const;

  async load(source: TemplateSource, targetDir: string): Promise<string[]> {
    this.validateSource(source);
    const urlSource = source as UrlTemplateSource;

    // Create a temporary directory
    const tempDir = path.join(
      process.cwd(),
      '.template-cache',
      `url-${Date.now()}`
    );
    const tempFile = path.join(tempDir, 'archive');
    const extractDir = path.join(tempDir, 'extracted');

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(extractDir, { recursive: true });

      // Download the file
      await this.downloadFile(urlSource, tempFile);

      // Determine format from URL or explicit setting
      const format = urlSource.format || this.detectFormat(urlSource.url);

      // Extract the archive
      await this.extractArchive(tempFile, extractDir, format, urlSource.stripComponents);

      // Copy files to target
      const files = await directoryLoader.load(
        { type: 'directory', path: extractDir },
        targetDir
      );

      return files;
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Download a file from URL
   */
  private async downloadFile(source: UrlTemplateSource, targetPath: string): Promise<void> {
    try {
      // Build curl command
      const curlArgs = ['-fsSL', '-o', targetPath];

      // Add custom headers if provided
      if (source.headers) {
        for (const [key, value] of Object.entries(source.headers)) {
          curlArgs.push('-H', `${key}: ${value}`);
        }
      }

      curlArgs.push(source.url);

      execSync(`curl ${curlArgs.map(arg => `"${arg}"`).join(' ')}`, {
        stdio: 'pipe',
        timeout: 120000, // 2 minute timeout
      });
    } catch (error) {
      throw new Error(`Failed to download from URL: ${source.url}`);
    }
  }

  /**
   * Detect archive format from URL
   */
  private detectFormat(url: string): 'tar' | 'tar.gz' | 'zip' {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.endsWith('.tar.gz') || lowerUrl.endsWith('.tgz')) {
      return 'tar.gz';
    }
    if (lowerUrl.endsWith('.tar')) {
      return 'tar';
    }
    if (lowerUrl.endsWith('.zip')) {
      return 'zip';
    }

    // Default to tar.gz
    return 'tar.gz';
  }

  /**
   * Extract an archive
   */
  private async extractArchive(
    archivePath: string,
    targetDir: string,
    format: 'tar' | 'tar.gz' | 'zip',
    stripComponents?: number
  ): Promise<void> {
    try {
      if (format === 'tar' || format === 'tar.gz') {
        const tarArgs = ['xf', archivePath, '-C', targetDir];

        if (format === 'tar.gz') {
          tarArgs.splice(1, 0, 'z');
        }

        if (stripComponents && stripComponents > 0) {
          tarArgs.push(`--strip-components=${stripComponents}`);
        }

        execSync(`tar ${tarArgs.join(' ')}`, {
          stdio: 'pipe',
          timeout: 60000,
        });
      } else if (format === 'zip') {
        execSync(`unzip -q "${archivePath}" -d "${targetDir}"`, {
          stdio: 'pipe',
          timeout: 60000,
        });

        // Handle strip components for zip (move files up)
        if (stripComponents && stripComponents > 0) {
          await this.stripZipComponents(targetDir, stripComponents);
        }
      }
    } catch (error) {
      throw new Error(`Failed to extract archive: ${archivePath}`);
    }
  }

  /**
   * Strip leading path components from extracted zip
   */
  private async stripZipComponents(dir: string, levels: number): Promise<void> {
    let currentDir = dir;

    for (let i = 0; i < levels; i++) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());

      if (dirs.length !== 1 || !dirs[0]) {
        // Can't strip if there's not exactly one directory
        return;
      }

      currentDir = path.join(currentDir, dirs[0].name);
    }

    // Move contents from nested directory to target
    if (currentDir !== dir) {
      const entries = await fs.readdir(currentDir);
      for (const entry of entries) {
        const src = path.join(currentDir, entry);
        const dest = path.join(dir, entry);
        await fs.rename(src, dest);
      }

      // Clean up empty directories
      let cleanup = currentDir;
      while (cleanup !== dir) {
        try {
          await fs.rmdir(cleanup);
        } catch {
          break;
        }
        cleanup = path.dirname(cleanup);
      }
    }
  }
}

export const urlLoader = new UrlTemplateLoader();
