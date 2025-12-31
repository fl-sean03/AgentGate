// Git operations
export {
  isGitRepo,
  initRepo,
  cloneRepo,
  getCurrentSha,
  getDiff,
  stageAll,
  commit,
  hasUncommittedChanges,
  getShortSha,
  createBranch,
  checkout,
  getChangedFiles,
  exportArchive,
  // Remote operations (v0.2.4)
  hasRemote,
  addRemote,
  setRemoteUrl,
  getRemoteUrl,
  removeRemote,
  // Push/Pull operations (v0.2.4)
  push,
  pull,
  fetch,
  // Branch operations (v0.2.4)
  branchExists,
  createAndPushBranch,
  getRemoteBranches,
  getCurrentBranch,
  hasUpstream,
  type PushOptions,
  type PushResult,
  type PullResult,
} from './git-ops.js';

// Workspace store
export {
  saveWorkspace,
  loadWorkspace,
  deleteWorkspace,
  listWorkspaces,
  findWorkspaceByPath,
  updateWorkspace,
} from './workspace-store.js';

// Lease management
export {
  acquire,
  release,
  refresh,
  isLeased,
  getActiveLease,
  cleanupExpiredLeases,
  getLease,
} from './lease.js';

// Path policy
export {
  isPathWithinRoot,
  isPathAllowed,
  findForbiddenFiles,
  validateWorkspace,
  createPathPolicy,
} from './path-policy.js';

// Checkout operations
export {
  extractSnapshot,
  createCleanCheckout,
  cleanupCheckout,
  createWorkingCopy,
  syncFromWorkingCopy,
} from './checkout.js';

// Workspace manager
export {
  create,
  createFresh,
  createFromGit,
  initialize,
  get,
  deleteById,
  getByPath,
  list,
  setStatus,
  getWorkspaceSha,
  exists,
  refresh as refreshWorkspace,
  type SeedFile,
  type CreateFreshOptions,
} from './manager.js';

// Templates for seeding workspaces
export {
  getDefaultClaudeMd,
  getDefaultGitignore,
  getDefaultSeedFiles,
  getMinimalSeedFiles,
  getTypeScriptSeedFiles,
  getPythonSeedFiles,
  type TemplateVars,
} from './templates.js';

// GitHub operations (v0.2.4)
export {
  createGitHubClient,
  getGitHubConfigFromEnv,
  validateAuth,
  repositoryExists,
  getRepository,
  createRepository,
  createPullRequest,
  getPullRequest,
  getAuthenticatedRemoteUrl,
  stripTokenFromUrl,
  parseGitHubUrl,
  buildGitHubUrl,
  buildCloneUrl,
} from './github.js';

// Convenience namespace for manager operations
export * as workspaceManager from './manager.js';
export * as leaseManager from './lease.js';
export * as gitOps from './git-ops.js';
export * as pathPolicy from './path-policy.js';
export * as checkoutOps from './checkout.js';
export * as templates from './templates.js';
export * as gitHub from './github.js';
