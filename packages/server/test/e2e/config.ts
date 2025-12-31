export const E2E_CONFIG = {
  // Timeout for long-running operations
  OPERATION_TIMEOUT: 60000, // 60 seconds

  // Timeout for work order completion
  COMPLETION_TIMEOUT: 300000, // 5 minutes

  // Poll interval for status checks
  POLL_INTERVAL: 1000, // 1 second

  // Test workspace configuration
  TEST_WORKSPACE: {
    owner: process.env.GITHUB_REPO_OWNER || 'test-org',
    repo: process.env.GITHUB_REPO_NAME || 'test-repo',
    branch: process.env.GITHUB_REPO_BRANCH || 'main',
  },

  // API configuration
  API_KEY: process.env.AGENTGATE_API_KEY || 'test-api-key',
};

export function skipIfNoGitHub(): boolean {
  return !process.env.AGENTGATE_GITHUB_TOKEN && !process.env.GITHUB_TOKEN;
}
