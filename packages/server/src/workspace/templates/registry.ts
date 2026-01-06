/**
 * Template Registry
 *
 * In-memory registry for workspace templates.
 * SaaS layer can provide persistence and sync templates from database.
 */

import type {
  WorkspaceTemplate,
  ListTemplatesOptions,
} from './types.js';

/**
 * Template Registry manages workspace templates
 */
export class TemplateRegistry {
  private templates: Map<string, WorkspaceTemplate> = new Map();

  /**
   * Register a template
   */
  register(template: WorkspaceTemplate): void {
    if (!template.id) {
      throw new Error('Template must have an id');
    }

    if (!template.name) {
      throw new Error('Template must have a name');
    }

    if (!template.source) {
      throw new Error('Template must have a source');
    }

    // Set default version if not provided
    const normalizedTemplate: WorkspaceTemplate = {
      ...template,
      version: template.version || '1.0.0',
      createdAt: template.createdAt || new Date(),
      updatedAt: template.updatedAt || new Date(),
    };

    this.templates.set(template.id, normalizedTemplate);
  }

  /**
   * Unregister a template
   */
  unregister(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * Get a template by ID
   */
  get(templateId: string): WorkspaceTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Check if a template exists
   */
  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * List all templates with optional filtering
   */
  list(options: ListTemplatesOptions = {}): WorkspaceTemplate[] {
    let templates = Array.from(this.templates.values());

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      templates = templates.filter((t) =>
        options.tags!.some((tag) => t.tags?.includes(tag))
      );
    }

    // Filter by organization
    if (options.organizationId) {
      templates = templates.filter(
        (t) => t.organizationId === options.organizationId || t.builtIn
      );
    }

    // Filter by built-in
    if (options.includeBuiltIn === false) {
      templates = templates.filter((t) => !t.builtIn);
    }

    // Search by name/description
    if (options.search) {
      const search = options.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search)
      );
    }

    return templates;
  }

  /**
   * Get count of registered templates
   */
  count(): number {
    return this.templates.size;
  }

  /**
   * Clear all templates (useful for testing)
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Get all template IDs
   */
  getIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Update an existing template
   */
  update(templateId: string, updates: Partial<WorkspaceTemplate>): WorkspaceTemplate | undefined {
    const existing = this.templates.get(templateId);
    if (!existing) {
      return undefined;
    }

    const updated: WorkspaceTemplate = {
      ...existing,
      ...updates,
      id: templateId, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    this.templates.set(templateId, updated);
    return updated;
  }
}

// Global default registry instance
export const defaultTemplateRegistry = new TemplateRegistry();
