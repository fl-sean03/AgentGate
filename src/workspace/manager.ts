import { access, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nanoid } from 'nanoid';
import type { Workspace, WorkspaceSource } from '../types/index.js';
import { WorkspaceStatus } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  saveWorkspace,
  loadWorkspace,
  deleteWorkspace,
  listWorkspaces,
  findWorkspaceByPath,
  updateWorkspace,
} from './workspace-store.js';
import {
  isGitRepo,
  initRepo,
  cloneRepo,
  getCurrentSha,
  checkout,
  stageAll,
  commit,
  hasUncommittedChanges,
} from './git-ops.js';
import { getActiveLease, release as releaseLease } from './lease.js';

const log = createLogger('workspace-manager');

/**
 * Seed file for initializing a fresh workspace
 */
export interface SeedFile {
  /** Relative path within workspace (e.g., 'CLAUDE.md', 'src/index.ts') */
  path: string;
  /** File content */
  content: string;
}

/**
 * Options for creating a fresh workspace
 */
export interface CreateFreshOptions {
  /** Seed files to create in the workspace (e.g., CLAUDE.md, agent instructions) */
  seedFiles?: SeedFile[];
  /** Initial commit message (default: 'Initial workspace setup') */
  commitMessage?: string;
}

/**
 * Create a fresh empty workspace with git initialized
 * Perfect for spawning agents in a clean environment
 *
 * @param destPath - Directory path to create (will be created if doesn't exist)
 * @param options - Optional seed files and configuration
 *
 * @example
 * ```typescript
 * // Create empty workspace
 * const ws = await createFresh('/tmp/my-project');
 *
 * // Create workspace with seed files for Claude
 * const ws = await createFresh('/tmp/my-project', {
 *   seedFiles: [
 *     { path: 'CLAUDE.md', content: '# Project Instructions\n\nBuild a REST API...' },
 *     { path: '.gitignore', content: 'node_modules/\ndist/\n.env' },
 *   ],
 *   commitMessage: 'Initialize project with requirements'
 * });
 * ```
 */
export async function createFresh(
  destPath: string,
  options: CreateFreshOptions = {}
): Promise<Workspace> {
  const id = nanoid();
  const now = new Date();
  const rootPath = resolve(destPath);
  const { seedFiles = [], commitMessage = 'Initial workspace setup' } = options;

  log.info({ id, destPath, seedFileCount: seedFiles.length }, 'Creating fresh workspace');

  // Create the directory
  await mkdir(rootPath, { recursive: true });

  // Write seed files
  const { writeFile } = await import('node:fs/promises');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Static functions, not methods
  const { join, dirname } = await import('node:path');

  for (const seed of seedFiles) {
    const filePath = join(rootPath, seed.path);
    // Ensure parent directories exist
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, seed.content);
    log.debug({ path: seed.path }, 'Created seed file');
  }

  // If no seed files, create a .gitkeep so we have something to commit
  if (seedFiles.length === 0) {
    await writeFile(join(rootPath, '.gitkeep'), '');
  }

  // Initialize git
  await initRepo(rootPath);

  // Create initial commit
  await stageAll(rootPath);
  await commit(rootPath, commitMessage);

  const source: WorkspaceSource = { type: 'local', path: rootPath };

  const workspace: Workspace = {
    id,
    rootPath,
    source,
    leaseId: null,
    leasedAt: null,
    status: WorkspaceStatus.AVAILABLE,
    gitInitialized: true,
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspace(workspace);
  log.info({ id, rootPath, seedFileCount: seedFiles.length }, 'Fresh workspace created');

  return workspace;
}

/**
 * Create a new workspace from a source
 */
export async function create(source: WorkspaceSource): Promise<Workspace> {
  const id = nanoid();
  const now = new Date();

  let rootPath: string;
  let gitInitialized = false;

  if (source.type === 'local') {
    rootPath = resolve(source.path);

    // Verify the path exists
    try {
      await access(rootPath);
    } catch {
      throw new Error(`Local path does not exist: ${rootPath}`);
    }

    // Check if it's already a git repo
    gitInitialized = await isGitRepo(rootPath);
  } else if (source.type === 'git') {
    // For git sources, we need to clone to a local path
    // The actual clone happens during initialize()
    throw new Error(
      'Git source requires calling initialize() after create() to clone the repository'
    );
  } else {
    throw new Error(`Unknown workspace source type: ${(source as { type: string }).type}`);
  }

  const workspace: Workspace = {
    id,
    rootPath,
    source,
    leaseId: null,
    leasedAt: null,
    status: WorkspaceStatus.AVAILABLE,
    gitInitialized,
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspace(workspace);
  log.info({ id, rootPath, source }, 'Workspace created');

  return workspace;
}

/**
 * Create a workspace from a git URL (clone and create)
 */
export async function createFromGit(
  url: string,
  destPath: string,
  branch?: string
): Promise<Workspace> {
  const id = nanoid();
  const now = new Date();
  const rootPath = resolve(destPath);

  log.info({ id, url, destPath }, 'Cloning repository for workspace');

  // Clone the repository
  await cloneRepo(url, rootPath);

  // If branch specified, checkout that branch
  if (branch) {
    await checkout(rootPath, branch);
  }

  const source: WorkspaceSource = { type: 'git', url, branch };

  const workspace: Workspace = {
    id,
    rootPath,
    source,
    leaseId: null,
    leasedAt: null,
    status: WorkspaceStatus.AVAILABLE,
    gitInitialized: true,
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspace(workspace);
  log.info({ id, rootPath, url }, 'Git workspace created');

  return workspace;
}

/**
 * Initialize a workspace (ensure git is set up)
 */
export async function initialize(workspace: Workspace): Promise<void> {
  log.debug({ id: workspace.id }, 'Initializing workspace');

  if (!workspace.gitInitialized) {
    // Initialize git repo if not already initialized
    const isRepo = await isGitRepo(workspace.rootPath);
    if (!isRepo) {
      await initRepo(workspace.rootPath);

      // Create initial commit if there are files
      const hasChanges = await hasUncommittedChanges(workspace.rootPath);
      if (hasChanges) {
        await stageAll(workspace.rootPath);
        await commit(workspace.rootPath, 'Initial commit');
        log.debug({ id: workspace.id }, 'Created initial commit');
      }
    }

    await updateWorkspace(workspace.id, (w) => ({
      ...w,
      gitInitialized: true,
    }));

    log.info({ id: workspace.id }, 'Workspace initialized with git');
  }
}

/**
 * Get a workspace by ID
 */
export async function get(id: string): Promise<Workspace | null> {
  return loadWorkspace(id);
}

/**
 * Delete a workspace
 * Optionally delete the workspace files from disk
 */
export async function deleteById(
  id: string,
  options: { deleteFiles?: boolean } = {}
): Promise<void> {
  const workspace = await loadWorkspace(id);
  if (!workspace) {
    log.warn({ id }, 'Attempted to delete non-existent workspace');
    return;
  }

  // Release any active lease
  const lease = await getActiveLease(workspace.id);
  if (lease) {
    await releaseLease(lease.id);
  }

  // Delete workspace files if requested
  if (options.deleteFiles) {
    try {
      await rm(workspace.rootPath, { recursive: true, force: true });
      log.debug({ id, path: workspace.rootPath }, 'Deleted workspace files');
    } catch (error) {
      log.warn({ id, path: workspace.rootPath, error }, 'Failed to delete workspace files');
    }
  }

  // Delete workspace metadata
  await deleteWorkspace(id);
  log.info({ id }, 'Workspace deleted');
}

/**
 * Get a workspace by its root path
 */
export async function getByPath(path: string): Promise<Workspace | null> {
  const resolvedPath = resolve(path);
  return findWorkspaceByPath(resolvedPath);
}

/**
 * Get all workspaces
 */
export async function list(): Promise<Workspace[]> {
  return listWorkspaces();
}

/**
 * Update workspace status
 */
export async function setStatus(
  id: string,
  status: Workspace['status']
): Promise<Workspace | null> {
  return updateWorkspace(id, (w) => ({
    ...w,
    status,
  }));
}

/**
 * Get the current SHA of the workspace
 */
export async function getWorkspaceSha(workspace: Workspace): Promise<string> {
  if (!workspace.gitInitialized) {
    throw new Error(`Workspace ${workspace.id} is not git initialized`);
  }
  return getCurrentSha(workspace.rootPath);
}

/**
 * Check if a workspace exists and is accessible
 */
export async function exists(id: string): Promise<boolean> {
  const workspace = await loadWorkspace(id);
  if (!workspace) return false;

  try {
    await access(workspace.rootPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh workspace status based on current state
 */
export async function refresh(id: string): Promise<Workspace | null> {
  const workspace = await loadWorkspace(id);
  if (!workspace) return null;

  // Check if leased
  const lease = await getActiveLease(workspace.id);

  // Check if path is accessible
  let pathAccessible = true;
  try {
    await access(workspace.rootPath);
  } catch {
    pathAccessible = false;
  }

  let newStatus: Workspace['status'];
  if (!pathAccessible) {
    newStatus = WorkspaceStatus.ERROR;
  } else if (lease) {
    newStatus = WorkspaceStatus.LEASED;
  } else {
    newStatus = WorkspaceStatus.AVAILABLE;
  }

  return updateWorkspace(id, (w) => ({
    ...w,
    status: newStatus,
    leaseId: lease?.id ?? null,
    leasedAt: lease?.acquiredAt ?? null,
  }));
}

// ============================================================================
// GitHub Workspace Operations (v0.2.4)
// ============================================================================

import type { GitHubSource, GitHubNewSource } from '../types/index.js';
import {
  createGitHubClient,
  getGitHubConfigFromEnv,
  repositoryExists,
  getRepository,
  createRepository as createGitHubRepository,
  getAuthenticatedRemoteUrl,
  buildCloneUrl,
} from './github.js';
import {
  addRemote,
  setRemoteUrl,
  pull,
  push,
  fetch,
  type PushResult,
  type PullResult,
} from './git-ops.js';
import {
  getTypeScriptSeedFiles,
  getPythonSeedFiles,
  getMinimalSeedFiles,
  type TemplateVars,
} from './templates.js';
import { getAgentGateRoot } from '../artifacts/paths.js';

/**
 * Options for creating a GitHub-backed workspace
 */
export interface CreateFromGitHubOptions {
  /** Local destination path (default: ~/.agentgate/workspaces/<id>) */
  destPath?: string;
}

/**
 * Create a workspace from an existing GitHub repository
 *
 * @example
 * ```typescript
 * const source: GitHubSource = { type: 'github', owner: 'owner', repo: 'repo' };
 * const workspace = await createFromGitHub(source);
 * ```
 */
export async function createFromGitHub(
  source: GitHubSource,
  options: CreateFromGitHubOptions = {}
): Promise<Workspace> {
  const id = nanoid();
  const now = new Date();

  // Get GitHub config and create client
  const config = getGitHubConfigFromEnv();
  const client = createGitHubClient(config);

  // Verify repository exists
  const exists = await repositoryExists(client, source.owner, source.repo);
  if (!exists) {
    throw new Error(`GitHub repository ${source.owner}/${source.repo} not found or not accessible`);
  }

  // Get repository info
  const repoInfo = await getRepository(client, source.owner, source.repo);

  // Determine local path
  const rootPath = options.destPath
    ? resolve(options.destPath)
    : resolve(getAgentGateRoot(), 'workspaces', id);

  log.info({ id, owner: source.owner, repo: source.repo, destPath: rootPath }, 'Cloning GitHub repository');

  // Clone with authenticated URL
  const authenticatedUrl = getAuthenticatedRemoteUrl(repoInfo.cloneUrl, config.token);
  await cloneRepo(authenticatedUrl, rootPath);

  // Checkout specific branch if requested
  if (source.branch && source.branch !== repoInfo.defaultBranch) {
    await checkout(rootPath, source.branch);
  }

  // Update remote to use authenticated URL (for future push/pull)
  await setRemoteUrl(rootPath, 'origin', authenticatedUrl);

  const workspace: Workspace = {
    id,
    rootPath,
    source,
    leaseId: null,
    leasedAt: null,
    status: WorkspaceStatus.AVAILABLE,
    gitInitialized: true,
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspace(workspace);
  log.info({ id, rootPath, owner: source.owner, repo: source.repo }, 'GitHub workspace created');

  return workspace;
}

/**
 * Options for creating a new GitHub repository workspace
 */
export interface CreateGitHubRepoOptions {
  /** Local destination path (default: ~/.agentgate/workspaces/<id>) */
  destPath?: string;
  /** Seed files to create in the workspace */
  seedFiles?: SeedFile[];
  /** Initial commit message */
  commitMessage?: string;
  /** Description for the new repository */
  description?: string;
}

/**
 * Create a new GitHub repository and workspace
 *
 * @example
 * ```typescript
 * const source: GitHubNewSource = {
 *   type: 'github-new',
 *   owner: 'myuser',
 *   repoName: 'new-project',
 *   private: true
 * };
 * const workspace = await createGitHubRepo(source);
 * ```
 */
export async function createGitHubRepo(
  source: GitHubNewSource,
  options: CreateGitHubRepoOptions = {}
): Promise<Workspace> {
  const id = nanoid();
  const now = new Date();

  // Get GitHub config and create client
  const config = getGitHubConfigFromEnv();
  const client = createGitHubClient(config);

  log.info({ id, owner: source.owner, repoName: source.repoName }, 'Creating new GitHub repository');

  // Create the repository on GitHub
  const repoInfo = await createGitHubRepository(client, {
    name: source.repoName,
    description: options.description,
    private: source.private ?? false,
    autoInit: false, // We'll do our own initialization
  });

  // Determine local path
  const rootPath = options.destPath
    ? resolve(options.destPath)
    : resolve(getAgentGateRoot(), 'workspaces', id);

  // Create local directory
  await mkdir(rootPath, { recursive: true });

  // Initialize git
  await initRepo(rootPath);

  // Generate seed files based on template
  let seedFiles = options.seedFiles ?? [];
  if (seedFiles.length === 0 && source.template) {
    const templateVars: TemplateVars = {
      projectName: source.repoName,
      taskDescription: 'Project created by AgentGate',
    };

    switch (source.template) {
      case 'typescript':
        seedFiles = getTypeScriptSeedFiles(templateVars);
        break;
      case 'python':
        seedFiles = getPythonSeedFiles(templateVars);
        break;
      case 'minimal':
      default:
        seedFiles = getMinimalSeedFiles(templateVars);
        break;
    }
  }

  // If no seed files, create a .gitkeep
  if (seedFiles.length === 0) {
    const { writeFile } = await import('node:fs/promises');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Static function
    const { join } = await import('node:path');
    await writeFile(join(rootPath, '.gitkeep'), '');
  } else {
    // Write seed files
    const { writeFile } = await import('node:fs/promises');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Static function
    const { join, dirname } = await import('node:path');

    for (const seed of seedFiles) {
      const filePath = join(rootPath, seed.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, seed.content);
      log.debug({ path: seed.path }, 'Created seed file');
    }
  }

  // Create initial commit
  await stageAll(rootPath);
  await commit(rootPath, options.commitMessage ?? 'Initial commit by AgentGate');

  // Add remote and push
  const authenticatedUrl = getAuthenticatedRemoteUrl(repoInfo.cloneUrl, config.token);
  await addRemote(rootPath, 'origin', authenticatedUrl);
  await push(rootPath, 'origin', 'main', { setUpstream: true });

  log.info({ id, rootPath, repoUrl: repoInfo.cloneUrl }, 'GitHub repository created and pushed');

  const workspace: Workspace = {
    id,
    rootPath,
    source,
    leaseId: null,
    leasedAt: null,
    status: WorkspaceStatus.AVAILABLE,
    gitInitialized: true,
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkspace(workspace);
  log.info({ id, rootPath, owner: source.owner, repo: source.repoName }, 'GitHub workspace created');

  return workspace;
}

/**
 * Sync workspace with GitHub (pull latest changes)
 */
export async function syncWithGitHub(workspace: Workspace): Promise<PullResult> {
  if (workspace.source.type !== 'github' && workspace.source.type !== 'github-new') {
    throw new Error('syncWithGitHub only works with GitHub-backed workspaces');
  }

  log.debug({ id: workspace.id }, 'Syncing with GitHub');

  // Ensure remote is configured with current token
  const config = getGitHubConfigFromEnv();
  const owner = workspace.source.type === 'github'
    ? workspace.source.owner
    : workspace.source.owner;
  const repo = workspace.source.type === 'github'
    ? workspace.source.repo
    : workspace.source.repoName;

  const cloneUrl = buildCloneUrl(owner, repo);
  const authenticatedUrl = getAuthenticatedRemoteUrl(cloneUrl, config.token);

  // Update remote URL with current token
  await setRemoteUrl(workspace.rootPath, 'origin', authenticatedUrl);

  // Fetch latest
  await fetch(workspace.rootPath, 'origin');

  // Pull changes
  const branch = workspace.source.type === 'github' && workspace.source.branch
    ? workspace.source.branch
    : 'main';

  const result = await pull(workspace.rootPath, 'origin', branch);

  log.info({ id: workspace.id, filesChanged: result.filesChanged }, 'Synced with GitHub');

  return result;
}

/**
 * Push workspace changes to GitHub
 */
export async function pushToGitHub(
  workspace: Workspace,
  branch: string,
  message: string
): Promise<PushResult> {
  if (workspace.source.type !== 'github' && workspace.source.type !== 'github-new') {
    throw new Error('pushToGitHub only works with GitHub-backed workspaces');
  }

  log.debug({ id: workspace.id, branch, message }, 'Pushing to GitHub');

  // Ensure remote is configured with current token
  const config = getGitHubConfigFromEnv();
  const owner = workspace.source.type === 'github'
    ? workspace.source.owner
    : workspace.source.owner;
  const repo = workspace.source.type === 'github'
    ? workspace.source.repo
    : workspace.source.repoName;

  const cloneUrl = buildCloneUrl(owner, repo);
  const authenticatedUrl = getAuthenticatedRemoteUrl(cloneUrl, config.token);

  // Update remote URL with current token
  await setRemoteUrl(workspace.rootPath, 'origin', authenticatedUrl);

  // Stage and commit if there are changes
  if (await hasUncommittedChanges(workspace.rootPath)) {
    await stageAll(workspace.rootPath);
    await commit(workspace.rootPath, message);
  }

  // Push to branch
  const result = await push(workspace.rootPath, 'origin', branch, { setUpstream: true });

  log.info({ id: workspace.id, branch, remoteRef: result.remoteRef }, 'Pushed to GitHub');

  return result;
}

/**
 * Check if workspace is GitHub-backed
 */
export function isGitHubWorkspace(workspace: Workspace): boolean {
  return workspace.source.type === 'github' || workspace.source.type === 'github-new';
}

/**
 * Get GitHub info from workspace
 */
export function getGitHubInfo(workspace: Workspace): { owner: string; repo: string } | null {
  if (workspace.source.type === 'github') {
    return { owner: workspace.source.owner, repo: workspace.source.repo };
  }
  if (workspace.source.type === 'github-new') {
    return { owner: workspace.source.owner, repo: workspace.source.repoName };
  }
  return null;
}

// Re-export for convenience
export { updateWorkspace } from './workspace-store.js';
