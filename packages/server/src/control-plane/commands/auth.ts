import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  print,
  printError,
  formatSuccess,
  formatError,
  bold,
  green,
  red,
  dim,
} from '../formatter.js';
import { createGitHubClient, validateAuth, getGitHubConfigFromEnv } from '../../workspace/github.js';

/**
 * Path to the AgentGate config file
 */
const CONFIG_PATH = join(homedir(), '.agentgate', 'config.json');

/**
 * Config file structure
 */
interface AgentGateConfig {
  github?: {
    token?: string;
  };
}

/**
 * Load config from file
 */
async function loadConfig(): Promise<AgentGateConfig> {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as AgentGateConfig;
  } catch {
    return {};
  }
}

/**
 * Save config to file
 */
async function saveConfig(config: AgentGateConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Create the auth command.
 */
export function createAuthCommand(): Command {
  const command = new Command('auth')
    .description('Manage authentication for external services');

  // GitHub subcommand
  command
    .command('github')
    .description('Manage GitHub authentication')
    .option('--token <token>', 'Set the GitHub Personal Access Token')
    .option('--status', 'Show current authentication status')
    .option('--clear', 'Remove saved GitHub token')
    .action(async (options: { token?: string; status?: boolean; clear?: boolean }) => {
      try {
        await executeGitHubAuth(options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute GitHub authentication command
 */
async function executeGitHubAuth(options: {
  token?: string;
  status?: boolean;
  clear?: boolean;
}): Promise<void> {
  if (options.clear) {
    // Clear saved token
    const config = await loadConfig();
    if (config.github?.token) {
      delete config.github.token;
      if (Object.keys(config.github).length === 0) {
        delete config.github;
      }
      await saveConfig(config);
      print(formatSuccess('GitHub token cleared from config'));
    } else {
      print(dim('No saved GitHub token to clear'));
    }
    return;
  }

  if (options.token) {
    // Set token
    const config = await loadConfig();
    config.github = config.github ?? {};
    config.github.token = options.token;
    await saveConfig(config);
    print(formatSuccess('GitHub token saved to config'));

    // Validate the token
    await showGitHubStatus(options.token);
    return;
  }

  if (options.status) {
    // Show status
    await showGitHubStatus();
    return;
  }

  // Default: show status
  await showGitHubStatus();
}

/**
 * Show GitHub authentication status
 */
async function showGitHubStatus(explicitToken?: string): Promise<void> {
  print(bold('GitHub Authentication Status'));
  print('');

  // Try to get token
  let token: string | undefined;
  let source: string = 'unknown';

  // Check explicit token first
  if (explicitToken) {
    token = explicitToken;
    source = 'provided';
  }

  // Check environment variable
  if (!token) {
    try {
      const config = getGitHubConfigFromEnv();
      token = config.token;
      source = 'AGENTGATE_GITHUB_TOKEN environment variable';
    } catch {
      // Not set in env
    }
  }

  // Check config file
  if (!token) {
    const config = await loadConfig();
    if (config.github?.token) {
      token = config.github.token;
      source = `config file (${CONFIG_PATH})`;
    }
  }

  if (!token) {
    print(`${red('Not authenticated')}`);
    print('');
    print('To authenticate, use one of these methods:');
    print(`  1. ${dim('Set environment variable:')} export AGENTGATE_GITHUB_TOKEN=ghp_xxx`);
    print(`  2. ${dim('Use auth command:')} agentgate auth github --token ghp_xxx`);
    print('');
    print('Create a token at: https://github.com/settings/tokens');
    print('Required scope: repo');
    return;
  }

  // Validate token
  print(`Token source: ${dim(source)}`);
  print('');

  try {
    const client = createGitHubClient({ token });
    const authResult = await validateAuth(client);

    if (authResult.authenticated) {
      print(`${green('Authenticated')} as ${bold(authResult.username)}`);
      print('');
      print(`Scopes: ${authResult.scopes.join(', ')}`);

      // Check for required scopes
      const hasRepoScope = authResult.scopes.includes('repo');
      if (!hasRepoScope) {
        print('');
        print(`${red('Warning:')} Token is missing the 'repo' scope required for GitHub operations`);
      }
    } else {
      print(`${red('Authentication failed')}`);
    }
  } catch (error) {
    print(`${red('Authentication failed:')} ${error instanceof Error ? error.message : String(error)}`);
  }
}
