/**
 * Template Routes
 *
 * API endpoints for managing workspace templates.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
} from '../types.js';
import {
  defaultTemplateRegistry,
} from '../../workspace/templates/registry.js';
import type {
  WorkspaceTemplate,
  ListTemplatesOptions,
} from '../../workspace/templates/types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('templates-routes');

/**
 * Template creation request body
 */
interface CreateTemplateBody {
  id: string;
  name: string;
  description?: string;
  version?: string;
  source: WorkspaceTemplate['source'];
  variables?: WorkspaceTemplate['variables'];
  hooks?: WorkspaceTemplate['hooks'];
  defaultHarness?: string;
  ignore?: string[];
  tags?: string[];
}

/**
 * Template update request body
 */
interface UpdateTemplateBody {
  name?: string;
  description?: string;
  version?: string;
  source?: WorkspaceTemplate['source'];
  variables?: WorkspaceTemplate['variables'];
  hooks?: WorkspaceTemplate['hooks'];
  defaultHarness?: string;
  ignore?: string[];
  tags?: string[];
}

/**
 * List templates query parameters
 */
interface ListTemplatesQuery {
  tags?: string;
  search?: string;
  includeBuiltIn?: string;
}

/**
 * Params for template routes
 */
interface TemplateParams {
  id: string;
}

/**
 * Register template management routes
 */
export function registerTemplateRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/templates
   * List available templates
   */
  app.get<{
    Querystring: ListTemplatesQuery;
  }>('/api/v1/templates', async (request, reply) => {
    logger.debug('Listing templates', request.query);

    const options: ListTemplatesOptions = {};

    if (request.query.tags) {
      options.tags = request.query.tags.split(',').map((t) => t.trim());
    }

    if (request.query.search) {
      options.search = request.query.search;
    }

    if (request.query.includeBuiltIn !== undefined) {
      options.includeBuiltIn = request.query.includeBuiltIn !== 'false';
    }

    const templates = defaultTemplateRegistry.list(options);

    return reply.send(
      createSuccessResponse({
        templates,
        count: templates.length,
      })
    );
  });

  /**
   * GET /api/v1/templates/:id
   * Get a specific template by ID
   */
  app.get<{
    Params: TemplateParams;
  }>('/api/v1/templates/:id', async (request, reply) => {
    const { id } = request.params;
    logger.debug('Getting template', { id });

    const template = defaultTemplateRegistry.get(id);

    if (!template) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Template not found: ${id}`
        )
      );
    }

    return reply.send(
      createSuccessResponse({
        template,
      })
    );
  });

  /**
   * POST /api/v1/templates
   * Register a new template
   */
  app.post<{
    Body: CreateTemplateBody;
  }>('/api/v1/templates', async (request, reply) => {
    const body = request.body;
    logger.info('Creating template', { id: body.id, name: body.name });

    // Validate required fields
    if (!body.id) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Template ID is required'
        )
      );
    }

    if (!body.name) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Template name is required'
        )
      );
    }

    if (!body.source) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Template source is required'
        )
      );
    }

    // Check if template already exists
    if (defaultTemplateRegistry.has(body.id)) {
      return reply.status(409).send(
        createErrorResponse(
          ErrorCode.CONFLICT,
          `Template already exists: ${body.id}`
        )
      );
    }

    const template: WorkspaceTemplate = {
      id: body.id,
      name: body.name,
      description: body.description,
      version: body.version || '1.0.0',
      source: body.source,
      variables: body.variables,
      hooks: body.hooks,
      defaultHarness: body.defaultHarness,
      ignore: body.ignore,
      tags: body.tags,
      builtIn: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      defaultTemplateRegistry.register(template);
      logger.info('Template created successfully', { id: body.id });

      return reply.status(201).send(
        createSuccessResponse({
          template,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create template', { error: message });

      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          `Failed to create template: ${message}`
        )
      );
    }
  });

  /**
   * PUT /api/v1/templates/:id
   * Update an existing template
   */
  app.put<{
    Params: TemplateParams;
    Body: UpdateTemplateBody;
  }>('/api/v1/templates/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body;
    logger.info('Updating template', { id });

    const existing = defaultTemplateRegistry.get(id);

    if (!existing) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Template not found: ${id}`
        )
      );
    }

    // Don't allow updating built-in templates
    if (existing.builtIn) {
      return reply.status(403).send(
        createErrorResponse(
          ErrorCode.FORBIDDEN,
          'Cannot update built-in templates'
        )
      );
    }

    try {
      const updated = defaultTemplateRegistry.update(id, body);

      if (!updated) {
        return reply.status(404).send(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Template not found: ${id}`
          )
        );
      }

      logger.info('Template updated successfully', { id });

      return reply.send(
        createSuccessResponse({
          template: updated,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update template', { error: message });

      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          `Failed to update template: ${message}`
        )
      );
    }
  });

  /**
   * DELETE /api/v1/templates/:id
   * Delete a template
   */
  app.delete<{
    Params: TemplateParams;
  }>('/api/v1/templates/:id', async (request, reply) => {
    const { id } = request.params;
    logger.info('Deleting template', { id });

    const existing = defaultTemplateRegistry.get(id);

    if (!existing) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Template not found: ${id}`
        )
      );
    }

    // Don't allow deleting built-in templates
    if (existing.builtIn) {
      return reply.status(403).send(
        createErrorResponse(
          ErrorCode.FORBIDDEN,
          'Cannot delete built-in templates'
        )
      );
    }

    const deleted = defaultTemplateRegistry.unregister(id);

    if (!deleted) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Template not found: ${id}`
        )
      );
    }

    logger.info('Template deleted successfully', { id });

    return reply.send(
      createSuccessResponse({
        success: true,
        id,
      })
    );
  });

  logger.info('Template routes registered');
}
