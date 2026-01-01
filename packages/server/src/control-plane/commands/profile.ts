/**
 * Profile Management Command
 *
 * Provides CLI commands for managing harness profiles:
 * - list: List all available profiles
 * - show: Display a specific profile
 * - create: Create a new profile from defaults
 * - validate: Validate a profile configuration
 * - delete: Delete a profile
 *
 * @module control-plane/commands/profile
 * @since v0.2.16 - Thrust 10
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';
import * as yaml from 'yaml';
import {
  print,
  printError,
  formatSuccess,
  formatError,
  formatWarning,
  bold,
  cyan,
  dim,
  green,
  yellow,
} from '../formatter.js';
import { harnessConfigSchema, LoopStrategyMode } from '../../types/index.js';

/**
 * Get the harness profiles directory path.
 */
function getProfilesDir(): string {
  return path.join(homedir(), '.agentgate', 'harnesses');
}

/**
 * Ensure the profiles directory exists.
 */
async function ensureProfilesDir(): Promise<void> {
  const dir = getProfilesDir();
  await fs.mkdir(dir, { recursive: true });
}

/**
 * List all profile files in the harnesses directory.
 */
async function listProfileFiles(): Promise<string[]> {
  const dir = getProfilesDir();
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch {
    return [];
  }
}

/**
 * Create the profile command with subcommands.
 */
export function createProfileCommand(): Command {
  const command = new Command('profile')
    .description('Manage harness profiles for agent execution')
    .addCommand(createListSubcommand())
    .addCommand(createShowSubcommand())
    .addCommand(createCreateSubcommand())
    .addCommand(createValidateSubcommand())
    .addCommand(createDeleteSubcommand());

  return command;
}

/**
 * List subcommand - show all available profiles.
 */
function createListSubcommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available harness profiles')
    .option('--json', 'Output as JSON', false)
    .action(async (options: { json: boolean }) => {
      try {
        await ensureProfilesDir();
        const files = await listProfileFiles();

        if (options.json) {
          const profiles = await Promise.all(
            files.map(async (file) => {
              const profilePath = path.join(getProfilesDir(), file);
              const content = await fs.readFile(profilePath, 'utf-8');
              const parsed = yaml.parse(content) as Record<string, unknown>;
              const metadata = parsed.metadata as Record<string, unknown> | undefined;
              return {
                name: file.replace(/\.ya?ml$/, ''),
                file,
                description: metadata?.description ?? null,
                extends: metadata?.extends ?? null,
              };
            })
          );
          print(JSON.stringify(profiles, null, 2));
          return;
        }

        if (files.length === 0) {
          print(formatWarning('No harness profiles found.'));
          print(dim(`\nProfiles are stored in: ${getProfilesDir()}`));
          print(dim('Create one with: agentgate profile create <name>'));
          return;
        }

        print(bold('Available Harness Profiles:'));
        print('');

        for (const file of files) {
          const profilePath = path.join(getProfilesDir(), file);
          const content = await fs.readFile(profilePath, 'utf-8');
          const parsed = yaml.parse(content) as Record<string, unknown>;
          const metadata = parsed.metadata as Record<string, unknown> | undefined;
          const name = file.replace(/\.ya?ml$/, '');
          const description = metadata?.description as string | undefined;
          const extendsProfile = metadata?.extends as string | undefined;

          print(`  ${cyan(name)}`);
          if (description) {
            print(`    ${dim(description)}`);
          }
          if (extendsProfile) {
            print(`    ${dim(`extends: ${extendsProfile}`)}`);
          }
        }

        print('');
        print(dim(`Profiles directory: ${getProfilesDir()}`));
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

/**
 * Show subcommand - display a specific profile.
 */
function createShowSubcommand(): Command {
  return new Command('show')
    .description('Display a harness profile configuration')
    .argument('<name>', 'Profile name')
    .option('--json', 'Output as JSON', false)
    .action(async (name: string, options: { json: boolean }) => {
      try {
        const profilePath = path.join(getProfilesDir(), `${name}.yaml`);

        try {
          await fs.access(profilePath);
        } catch {
          // Try .yml extension
          const ymlPath = path.join(getProfilesDir(), `${name}.yml`);
          try {
            await fs.access(ymlPath);
            const content = await fs.readFile(ymlPath, 'utf-8');
            if (options.json) {
              print(JSON.stringify(yaml.parse(content), null, 2));
            } else {
              print(bold(`Profile: ${cyan(name)}`));
              print('');
              print(content);
            }
            return;
          } catch {
            printError(formatError(`Profile not found: ${name}`));
            print(dim(`Expected at: ${profilePath}`));
            process.exitCode = 1;
            return;
          }
        }

        const content = await fs.readFile(profilePath, 'utf-8');
        if (options.json) {
          print(JSON.stringify(yaml.parse(content), null, 2));
        } else {
          print(bold(`Profile: ${cyan(name)}`));
          print('');
          print(content);
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

/**
 * Create subcommand - create a new profile.
 */
function createCreateSubcommand(): Command {
  return new Command('create')
    .description('Create a new harness profile from defaults')
    .argument('<name>', 'Profile name')
    .option('--extends <profile>', 'Parent profile to extend')
    .option('--description <text>', 'Profile description')
    .option(
      '--loop-strategy <mode>',
      `Loop strategy mode (${Object.values(LoopStrategyMode).join(', ')})`,
      'hybrid'
    )
    .option('--max-iterations <n>', 'Maximum iterations', '3')
    .option('--force', 'Overwrite existing profile', false)
    .action(async (
      name: string,
      options: {
        extends?: string;
        description?: string;
        loopStrategy: string;
        maxIterations: string;
        force: boolean;
      }
    ) => {
      try {
        await ensureProfilesDir();
        const profilePath = path.join(getProfilesDir(), `${name}.yaml`);

        // Check if profile already exists
        if (!options.force) {
          try {
            await fs.access(profilePath);
            printError(formatError(`Profile already exists: ${name}`));
            print(dim('Use --force to overwrite'));
            process.exitCode = 1;
            return;
          } catch {
            // Profile doesn't exist, continue
          }
        }

        // Build profile content
        const profile: Record<string, unknown> = {
          metadata: {
            name,
            description: options.description ?? `Custom harness profile: ${name}`,
            ...(options.extends && { extends: options.extends }),
          },
          loopStrategy: {
            mode: options.loopStrategy as LoopStrategyMode,
            ...(options.loopStrategy === 'fixed' && {
              maxIterations: parseInt(options.maxIterations, 10),
            }),
            ...(options.loopStrategy === 'hybrid' && {
              baseIterations: parseInt(options.maxIterations, 10),
              maxBonusIterations: 2,
              progressThreshold: 0.1,
            }),
            ...(options.loopStrategy === 'ralph' && {
              maxIterations: parseInt(options.maxIterations, 10),
              minIterations: 1,
              convergenceThreshold: 0.05,
            }),
            completionDetection: ['verification_pass', 'no_changes'],
          },
          verification: {
            cleanRoom: true,
            parallelTests: true,
          },
          gitOps: {
            mode: 'local',
            autoCommit: true,
          },
        };

        const yamlContent = yaml.stringify(profile, { indent: 2 });
        await fs.writeFile(profilePath, yamlContent);

        print(formatSuccess(`Profile created: ${name}`));
        print('');
        print(bold('Configuration:'));
        print(dim(yamlContent));
        print('');
        print(`${dim('Saved to:')} ${profilePath}`);
        print('');
        print(`${dim('Use with:')} agentgate submit --harness ${name} -p "your task"`);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

/**
 * Validate subcommand - validate a profile configuration.
 */
function createValidateSubcommand(): Command {
  return new Command('validate')
    .description('Validate a harness profile configuration')
    .argument('<name>', 'Profile name')
    .action(async (name: string) => {
      try {
        let profilePath = path.join(getProfilesDir(), `${name}.yaml`);
        let content: string;

        try {
          content = await fs.readFile(profilePath, 'utf-8');
        } catch {
          // Try .yml extension
          profilePath = path.join(getProfilesDir(), `${name}.yml`);
          try {
            content = await fs.readFile(profilePath, 'utf-8');
          } catch {
            printError(formatError(`Profile not found: ${name}`));
            process.exitCode = 1;
            return;
          }
        }

        // Parse YAML
        let parsed: unknown;
        try {
          parsed = yaml.parse(content);
        } catch (parseError) {
          printError(formatError('Invalid YAML syntax'));
          if (parseError instanceof Error) {
            print(dim(parseError.message));
          }
          process.exitCode = 1;
          return;
        }

        // Validate against schema
        const result = harnessConfigSchema.safeParse(parsed);

        if (result.success) {
          print(formatSuccess(`Profile is valid: ${name}`));
          print('');
          print(bold('Resolved configuration:'));

          // Show key settings
          const config = result.data;
          print(`  ${dim('Loop Strategy:')} ${green(config.loopStrategy?.mode ?? 'fixed')}`);
          if (config.loopStrategy?.mode === 'fixed') {
            print(`  ${dim('Max Iterations:')} ${config.loopStrategy.maxIterations ?? 3}`);
          } else if (config.loopStrategy?.mode === 'hybrid') {
            print(`  ${dim('Base Iterations:')} ${config.loopStrategy.baseIterations ?? 3}`);
            print(`  ${dim('Max Bonus:')} ${config.loopStrategy.maxBonusIterations ?? 2}`);
          } else if (config.loopStrategy?.mode === 'ralph') {
            print(`  ${dim('Max Iterations:')} ${config.loopStrategy.maxIterations ?? 10}`);
          }

          if (config.metadata?.extends) {
            print(`  ${dim('Extends:')} ${yellow(String(config.metadata.extends))}`);
          }
        } else {
          printError(formatError(`Profile validation failed: ${name}`));
          print('');
          for (const error of result.error.errors) {
            print(`  ${bold(error.path.join('.') || 'root')}: ${error.message}`);
          }
          process.exitCode = 1;
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

/**
 * Delete subcommand - delete a profile.
 */
function createDeleteSubcommand(): Command {
  return new Command('delete')
    .alias('rm')
    .description('Delete a harness profile')
    .argument('<name>', 'Profile name')
    .option('--force', 'Skip confirmation', false)
    .action(async (name: string, options: { force: boolean }) => {
      try {
        let profilePath = path.join(getProfilesDir(), `${name}.yaml`);

        try {
          await fs.access(profilePath);
        } catch {
          // Try .yml extension
          profilePath = path.join(getProfilesDir(), `${name}.yml`);
          try {
            await fs.access(profilePath);
          } catch {
            printError(formatError(`Profile not found: ${name}`));
            process.exitCode = 1;
            return;
          }
        }

        if (!options.force) {
          print(formatWarning(`This will delete profile: ${name}`));
          print(dim('Use --force to skip this message'));
          // In a real CLI, we'd prompt for confirmation here
          // For now, we'll just require --force
          process.exitCode = 1;
          return;
        }

        await fs.unlink(profilePath);
        print(formatSuccess(`Profile deleted: ${name}`));
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}
