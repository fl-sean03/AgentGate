/**
 * Template Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRegistry } from '../../src/workspace/templates/registry.js';
import type { WorkspaceTemplate } from '../../src/workspace/templates/types.js';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  const createTestTemplate = (overrides: Partial<WorkspaceTemplate> = {}): WorkspaceTemplate => ({
    id: 'test-template',
    name: 'Test Template',
    description: 'A test template',
    version: '1.0.0',
    source: {
      type: 'inline',
      files: {
        'package.json': '{"name": "test"}',
        'src/index.ts': 'console.log("hello");',
      },
    },
    ...overrides,
  });

  describe('register', () => {
    it('should register a template', () => {
      const template = createTestTemplate();
      registry.register(template);

      expect(registry.has('test-template')).toBe(true);
      expect(registry.count()).toBe(1);
    });

    it('should throw when registering template without id', () => {
      const template = createTestTemplate({ id: '' });
      expect(() => registry.register(template)).toThrow();
    });

    it('should overwrite when registering duplicate template', () => {
      const template = createTestTemplate({ version: '1.0.0' });
      registry.register(template);

      const updatedTemplate = createTestTemplate({ version: '2.0.0' });
      registry.register(updatedTemplate);

      expect(registry.get('test-template')?.version).toBe('2.0.0');
    });
  });

  describe('unregister', () => {
    it('should unregister a template', () => {
      const template = createTestTemplate();
      registry.register(template);

      expect(registry.unregister('test-template')).toBe(true);
      expect(registry.has('test-template')).toBe(false);
    });

    it('should return false for non-existent template', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return template by id', () => {
      const template = createTestTemplate();
      registry.register(template);

      const result = registry.get('test-template');
      expect(result?.name).toBe('Test Template');
    });

    it('should return undefined for non-existent template', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return all templates', () => {
      registry.register(createTestTemplate({ id: 'template-1', name: 'Template 1' }));
      registry.register(createTestTemplate({ id: 'template-2', name: 'Template 2' }));

      const templates = registry.list();
      expect(templates).toHaveLength(2);
    });

    it('should filter templates by search', () => {
      registry.register(createTestTemplate({ id: 'typescript-1', name: 'TypeScript Template 1' }));
      registry.register(createTestTemplate({ id: 'python-1', name: 'Python Template' }));
      registry.register(createTestTemplate({ id: 'typescript-2', name: 'TypeScript Template 2' }));

      const tsTemplates = registry.list({ search: 'typescript' });
      expect(tsTemplates).toHaveLength(2);
      expect(tsTemplates.every((t) => t.name.toLowerCase().includes('typescript'))).toBe(true);
    });
  });

  describe('getIds', () => {
    it('should return all template ids', () => {
      registry.register(createTestTemplate({ id: 'template-1' }));
      registry.register(createTestTemplate({ id: 'template-2' }));

      const ids = registry.getIds();
      expect(ids).toContain('template-1');
      expect(ids).toContain('template-2');
    });
  });

  describe('clear', () => {
    it('should remove all templates', () => {
      registry.register(createTestTemplate({ id: 'template-1' }));
      registry.register(createTestTemplate({ id: 'template-2' }));

      registry.clear();

      expect(registry.count()).toBe(0);
    });
  });

  describe('update', () => {
    it('should update template', () => {
      registry.register(createTestTemplate({ id: 'template-1', version: '1.0.0' }));

      const updated = registry.update('template-1', { version: '2.0.0' });
      expect(updated?.version).toBe('2.0.0');
    });

    it('should return undefined for non-existent template', () => {
      expect(registry.update('non-existent', { version: '2.0.0' })).toBeUndefined();
    });

    it('should not allow changing template id', () => {
      registry.register(createTestTemplate({ id: 'template-1' }));

      const updated = registry.update('template-1', { id: 'new-id' } as any);
      expect(updated?.id).toBe('template-1');
    });
  });

  describe('source type templates', () => {
    it('should register git template', () => {
      const template = createTestTemplate({
        id: 'git-template',
        source: {
          type: 'git',
          url: 'https://github.com/example/template.git',
          branch: 'main',
        },
      });
      registry.register(template);

      const result = registry.get('git-template');
      expect(result?.source.type).toBe('git');
    });

    it('should register url template', () => {
      const template = createTestTemplate({
        id: 'url-template',
        source: {
          type: 'url',
          url: 'https://example.com/template.tar.gz',
        },
      });
      registry.register(template);

      const result = registry.get('url-template');
      expect(result?.source.type).toBe('url');
    });

    it('should register directory template', () => {
      const template = createTestTemplate({
        id: 'dir-template',
        source: {
          type: 'directory',
          path: '/path/to/template',
        },
      });
      registry.register(template);

      const result = registry.get('dir-template');
      expect(result?.source.type).toBe('directory');
    });
  });

  describe('template with variables', () => {
    it('should store template with variables', () => {
      const template = createTestTemplate({
        id: 'var-template',
        variables: [
          { name: 'projectName', description: 'Project name', required: true },
          { name: 'author', description: 'Author name', default: 'Anonymous' },
        ],
      });
      registry.register(template);

      const result = registry.get('var-template');
      expect(result?.variables).toHaveLength(2);
      expect(result?.variables?.[0].name).toBe('projectName');
    });
  });

  describe('template with hooks', () => {
    it('should store template with hooks', () => {
      const template = createTestTemplate({
        id: 'hook-template',
        hooks: {
          beforeCreate: 'echo "Before create"',
          afterCreate: 'npm install',
        },
      });
      registry.register(template);

      const result = registry.get('hook-template');
      expect(result?.hooks?.beforeCreate).toBe('echo "Before create"');
      expect(result?.hooks?.afterCreate).toBe('npm install');
    });
  });
});
