#!/usr/bin/env node
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { App } from './App.js';
import { AuthManager } from './api/auth.js';

const program = new Command();

program
  .name('agentgate')
  .description('AgentGate TUI - AI-powered code changes, verified & delivered')
  .version('0.2.28');

program
  .option('-u, --api-url <url>', 'Override API URL')
  .option('-t, --token <token>', 'Use specific auth token')
  .action(async (options: { apiUrl?: string; token?: string }) => {
    render(
      <App
        initialScreen="home"
        apiUrl={options.apiUrl}
        token={options.token}
      />
    );
  });

program
  .command('run <repo>')
  .description('Start a task for a specific repository')
  .action(async (repo: string) => {
    render(<App initialScreen="task" initialRepo={repo} />);
  });

program
  .command('runs')
  .description('View run history')
  .action(async () => {
    render(<App initialScreen="runs" />);
  });

program
  .command('logout')
  .description('Clear stored credentials')
  .action(async () => {
    const authManager = new AuthManager();
    authManager.clearToken();
    console.log('Logged out successfully.');
    process.exit(0);
  });

program.parse();
