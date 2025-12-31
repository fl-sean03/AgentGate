/**
 * Workspace GitHub Integration Tests
 *
 * Tests for GitHub workspace source validation and metadata.
 */

import { describe, it, expect } from 'vitest';
import { workspaceSourceSchema } from '../src/types/work-order.js';
import { WorkspaceTemplate } from '../src/types/index.js';

describe('Workspace GitHub Integration', () => {
  describe('GitHub source validation', () => {
    it('should validate github source with owner and repo', () => {
      const source = {
        type: 'github',
        owner: 'testowner',
        repo: 'testrepo',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('github');
      }
    });

    it('should validate github source with optional branch', () => {
      const source = {
        type: 'github',
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'develop',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'github') {
        expect(result.data.branch).toBe('develop');
      }
    });

    it('should reject github source without owner', () => {
      const source = {
        type: 'github',
        repo: 'testrepo',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });

    it('should reject github source without repo', () => {
      const source = {
        type: 'github',
        owner: 'testowner',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });
  });

  describe('GitHub-new source validation', () => {
    it('should validate github-new source with owner and repoName', () => {
      const source = {
        type: 'github-new',
        owner: 'testowner',
        repoName: 'newrepo',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('github-new');
      }
    });

    it('should validate github-new source with private flag', () => {
      const source = {
        type: 'github-new',
        owner: 'testowner',
        repoName: 'newrepo',
        private: true,
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'github-new') {
        expect(result.data.private).toBe(true);
      }
    });

    it('should validate github-new source with template', () => {
      const source = {
        type: 'github-new',
        owner: 'testowner',
        repoName: 'newrepo',
        template: WorkspaceTemplate.TYPESCRIPT,
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'github-new') {
        expect(result.data.template).toBe(WorkspaceTemplate.TYPESCRIPT);
      }
    });

    it('should reject github-new source without owner', () => {
      const source = {
        type: 'github-new',
        repoName: 'newrepo',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });

    it('should reject github-new source without repoName', () => {
      const source = {
        type: 'github-new',
        owner: 'testowner',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('should still validate local source', () => {
      const source = {
        type: 'local',
        path: '/path/to/workspace',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should still validate git source', () => {
      const source = {
        type: 'git',
        url: 'https://github.com/owner/repo.git',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should still validate fresh source', () => {
      const source = {
        type: 'fresh',
        destPath: '/path/to/new/workspace',
      };
      const result = workspaceSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Source type discrimination', () => {
    it('should correctly discriminate between source types', () => {
      const sources = [
        { type: 'local', path: '/path' },
        { type: 'github', owner: 'o', repo: 'r' },
        { type: 'github-new', owner: 'o', repoName: 'r' },
        { type: 'git', url: 'https://example.com/repo.git' },
        { type: 'fresh', destPath: '/path' },
      ];

      for (const source of sources) {
        const result = workspaceSourceSchema.safeParse(source);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(source.type);
        }
      }
    });
  });
});
