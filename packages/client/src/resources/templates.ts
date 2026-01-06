/**
 * Templates Resource
 *
 * Manage workspace templates for B2B organizations.
 */

/**
 * Template source configuration types
 */
export interface GitTemplateSource {
  type: 'git';
  url: string;
  branch?: string;
  subpath?: string;
}

export interface UrlTemplateSource {
  type: 'url';
  url: string;
}

export interface InlineTemplateSource {
  type: 'inline';
  files: Record<string, string>;
}

export type TemplateSource = GitTemplateSource | UrlTemplateSource | InlineTemplateSource;

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

/**
 * Template summary (list response)
 */
export interface TemplateSummary {
  id: string;
  templateId: string;
  name: string;
  description?: string;
  version: string;
  sourceType: 'git' | 'url' | 'inline';
  createdAt: string;
  updatedAt: string;
}

/**
 * Template detail (get response)
 */
export interface TemplateDetail extends TemplateSummary {
  sourceConfig: TemplateSource;
  variables?: TemplateVariable[];
  hooks?: {
    beforeCreate?: string;
    afterCreate?: string;
  };
  defaultHarness?: string;
  ignore?: string[];
}

/**
 * Create template options
 */
export interface CreateTemplateOptions {
  templateId: string;
  name: string;
  description?: string;
  sourceType: 'git' | 'url' | 'inline';
  sourceConfig: TemplateSource;
  variables?: TemplateVariable[];
  hooks?: {
    beforeCreate?: string;
    afterCreate?: string;
  };
  defaultHarness?: string;
  ignore?: string[];
}

/**
 * Update template options
 */
export interface UpdateTemplateOptions {
  name?: string;
  description?: string;
  version?: string;
  sourceType?: 'git' | 'url' | 'inline';
  sourceConfig?: TemplateSource;
  variables?: TemplateVariable[];
  hooks?: {
    beforeCreate?: string;
    afterCreate?: string;
  };
  defaultHarness?: string;
  ignore?: string[];
}

/**
 * Templates list options
 */
export interface TemplatesListOptions {
  page?: number;
  pageSize?: number;
}

type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Templates API resource
 */
export class TemplatesResource {
  constructor(private request: RequestFn) {}

  /**
   * List all templates for the current organization
   */
  async list(options: TemplatesListOptions = {}): Promise<TemplateSummary[]> {
    const params: Record<string, string> = {};
    if (options.page) params.page = String(options.page);
    if (options.pageSize) params.pageSize = String(options.pageSize);

    return this.request('GET', '/api/v1/templates', { params });
  }

  /**
   * Get a template by ID
   */
  async get(id: string): Promise<TemplateDetail> {
    return this.request('GET', `/api/v1/templates/${id}`);
  }

  /**
   * Get a template by template ID (slug)
   */
  async getByTemplateId(templateId: string): Promise<TemplateDetail> {
    return this.request('GET', `/api/v1/templates/by-id/${templateId}`);
  }

  /**
   * Create a new template
   */
  async create(options: CreateTemplateOptions): Promise<TemplateDetail> {
    return this.request('POST', '/api/v1/templates', { body: options });
  }

  /**
   * Update a template
   */
  async update(id: string, options: UpdateTemplateOptions): Promise<TemplateDetail> {
    return this.request('PATCH', `/api/v1/templates/${id}`, { body: options });
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    return this.request('DELETE', `/api/v1/templates/${id}`);
  }

  /**
   * Test a template by creating a temporary workspace
   */
  async test(
    id: string,
    variables?: Record<string, string>
  ): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
    return this.request('POST', `/api/v1/templates/${id}/test`, {
      body: { variables },
    });
  }
}
