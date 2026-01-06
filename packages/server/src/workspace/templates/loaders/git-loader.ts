/**
 * Git Template Loader
 *
 * Loads templates by cloning from a git repository.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import type { TemplateSource, GitTemplateSource } from '../types.js';
import { BaseTemplateLoader } from './base-loader.js';
import { directoryLoader } from './directory-loader.js';

export class GitTemplateLoader extends BaseTemplateLoader {
  sourceType = 'git' as const;

  async load(source: TemplateSource, targetDir: string): Promise<string[]> {
    this.validateSource(source);
    const gitSource = source as GitTemplateSource;

    // Create a temporary directory for cloning
    const tempDir = path.join(
      process.cwd(),
      '.template-cache',
      `git-${Date.now()}`
    );

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Build git clone URL with auth if provided
      let cloneUrl = gitSource.url;
      if (gitSource.auth?.token) {
        // For GitHub/GitLab style token auth
        const urlParts = new URL(gitSource.url);
        urlParts.username = gitSource.auth.token;
        urlParts.password = 'x-oauth-basic';
        cloneUrl = urlParts.toString();
      } else if (gitSource.auth?.username && gitSource.auth?.password) {
        const urlParts = new URL(gitSource.url);
        urlParts.username = gitSource.auth.username;
        urlParts.password = gitSource.auth.password;
        cloneUrl = urlParts.toString();
      }

      // Build git clone command
      const cloneArgs = ['clone', '--depth', '1'];

      if (gitSource.branch) {
        cloneArgs.push('--branch', gitSource.branch);
      } else if (gitSource.tag) {
        cloneArgs.push('--branch', gitSource.tag);
      }

      cloneArgs.push(cloneUrl, tempDir);

      // Execute git clone
      try {
        execSync(`git ${cloneArgs.join(' ')}`, {
          stdio: 'pipe',
          timeout: 60000, // 60 second timeout
        });
      } catch (error) {
        throw new Error(`Failed to clone git repository: ${gitSource.url}`);
      }

      // If a specific commit was requested, checkout
      if (gitSource.commit) {
        try {
          execSync(`git checkout ${gitSource.commit}`, {
            cwd: tempDir,
            stdio: 'pipe',
          });
        } catch (error) {
          throw new Error(`Failed to checkout commit: ${gitSource.commit}`);
        }
      }

      // Determine the source directory (might be a subdirectory)
      const sourceDir = gitSource.subdirectory
        ? path.join(tempDir, gitSource.subdirectory)
        : tempDir;

      // Verify subdirectory exists
      try {
        await fs.access(sourceDir);
      } catch {
        throw new Error(`Subdirectory not found: ${gitSource.subdirectory}`);
      }

      // Use directory loader to copy files
      const files = await directoryLoader.load(
        { type: 'directory', path: sourceDir },
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
}

export const gitLoader = new GitTemplateLoader();
