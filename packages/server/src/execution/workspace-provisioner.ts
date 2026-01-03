/**
 * Workspace Provisioner (v0.2.24)
 *
 * Provisions workspaces based on WorkspaceSpec configuration.
 * Supports local, git, github, github-new, and fresh workspace types.
 *
 * @module execution/workspace-provisioner
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  Workspace,
  WorkspaceSource,
  GitHubSource,
  GitHubNewSource,
} from '../types/index.js';
import type {
  WorkspaceSpec,
  LocalWorkspace,
  GitWorkspace,
  GitHubWorkspace,
  GitHubNewWorkspace,
  FreshWorkspace,
} from '../types/execution-spec.js';
import {
  createFresh,
  create,
  createFromGit,
  createFromGitHub,
  createGitHubRepo,
  deleteById,
  type CreateFreshOptions,
} from '../workspace/manager.js';
import { createLogger } from '../utils/logger.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

const log = createLogger('workspace-provisioner');

// ═══════════════════════════════════════════════════════════════════════════
// PROVISIONER RESULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of workspace provisioning
 */
export interface ProvisionResult {
  /** Whether provisioning succeeded */
  success: boolean;
  /** The provisioned workspace (if successful) */
  workspace?: Workspace;
  /** Error message (if failed) */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVISIONER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Workspace provisioner
 */
export class WorkspaceProvisioner {
  /**
   * Provision a workspace based on the spec
   */
  async provision(spec: WorkspaceSpec): Promise<ProvisionResult> {
    log.info({ source: spec.source }, 'Provisioning workspace');

    try {
      let workspace: Workspace;

      switch (spec.source) {
        case 'local':
          workspace = await this.provisionLocal(spec);
          break;
        case 'git':
          workspace = await this.provisionGit(spec);
          break;
        case 'github':
          workspace = await this.provisionGitHub(spec);
          break;
        case 'github-new':
          workspace = await this.provisionGitHubNew(spec);
          break;
        case 'fresh':
          workspace = await this.provisionFresh(spec);
          break;
        default: {
          const exhaustiveCheck: never = spec;
          throw new Error(`Unknown workspace source: ${String(exhaustiveCheck)}`);
        }
      }

      log.info({ workspaceId: workspace.id, source: spec.source }, 'Workspace provisioned');
      return { success: true, workspace };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error, source: spec.source }, 'Workspace provisioning failed');
      return { success: false, error: message };
    }
  }

  /**
   * Provision a local workspace
   */
  private async provisionLocal(spec: LocalWorkspace): Promise<Workspace> {
    log.debug({ path: spec.path, readonly: spec.readonly }, 'Provisioning local workspace');

    const source: WorkspaceSource = {
      type: 'local',
      path: spec.path,
    };

    return create(source);
  }

  /**
   * Provision a git workspace by cloning
   */
  private async provisionGit(spec: GitWorkspace): Promise<Workspace> {
    log.debug({ url: spec.url, ref: spec.ref }, 'Provisioning git workspace');

    // Set credentials via environment if provided
    if (spec.credentials) {
      if (spec.credentials.type === 'token' && spec.credentials.token) {
        process.env['GIT_TOKEN'] = spec.credentials.token;
      } else if (spec.credentials.type === 'env' && spec.credentials.envVar) {
        log.debug({ envVar: spec.credentials.envVar }, 'Using environment variable for git credentials');
      }
    }

    // Generate a destination path
    const destPath = join(tmpdir(), 'agentgate-ws', nanoid());

    return createFromGit(spec.url, destPath, spec.ref);
  }

  /**
   * Provision a GitHub workspace
   */
  private async provisionGitHub(spec: GitHubWorkspace): Promise<Workspace> {
    log.debug({ owner: spec.owner, repo: spec.repo, ref: spec.ref, fork: spec.fork }, 'Provisioning GitHub workspace');

    // Convert to legacy GitHubSource type
    const source: GitHubSource = {
      type: 'github',
      owner: spec.owner,
      repo: spec.repo,
    };

    if (spec.ref) {
      (source as GitHubSource & { branch?: string }).branch = spec.ref;
    }

    return createFromGitHub(source);
  }

  /**
   * Provision a new GitHub repository workspace
   */
  private async provisionGitHubNew(spec: GitHubNewWorkspace): Promise<Workspace> {
    log.debug(
      { owner: spec.owner, repoName: spec.repoName, template: spec.template },
      'Provisioning new GitHub workspace'
    );

    // Convert to legacy GitHubNewSource type
    const source: GitHubNewSource = {
      type: 'github-new',
      owner: spec.owner,
      repoName: spec.repoName,
    };

    if (spec.private !== undefined) {
      (source as GitHubNewSource & { private?: boolean }).private = spec.private;
    }

    // Build options
    const options: { description?: string } = {};
    if (spec.description) {
      options.description = spec.description;
    }

    return createGitHubRepo(source, options);
  }

  /**
   * Provision a fresh workspace
   */
  private async provisionFresh(spec: FreshWorkspace): Promise<Workspace> {
    log.debug({ destPath: spec.destPath, template: spec.template }, 'Provisioning fresh workspace');

    const options: CreateFreshOptions = {};

    if (spec.projectName) {
      options.seedFiles = [
        {
          path: 'README.md',
          content: `# ${spec.projectName}\n\nA new project.\n`,
        },
      ];
      options.commitMessage = `Initialize ${spec.projectName}`;
    }

    // Note: template handling would need additional implementation
    // For now, we just create an empty fresh workspace
    if (spec.template) {
      log.warn({ template: spec.template }, 'Template support for fresh workspaces not yet implemented');
    }

    return createFresh(spec.destPath, options);
  }

  /**
   * Release a workspace (cleanup)
   */
  async release(workspace: Workspace): Promise<void> {
    log.debug({ workspaceId: workspace.id }, 'Releasing workspace');
    await deleteById(workspace.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new workspace provisioner
 */
export function createWorkspaceProvisioner(): WorkspaceProvisioner {
  return new WorkspaceProvisioner();
}
