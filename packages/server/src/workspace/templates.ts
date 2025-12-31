/**
 * Workspace seed templates
 *
 * Provides default and customizable templates for agent instruction files
 * that are seeded into fresh workspaces.
 */

import type { SeedFile } from './manager.js';

/**
 * Template variables that can be interpolated into templates
 */
export interface TemplateVars {
  /** Project name */
  projectName?: string;
  /** High-level task description */
  taskDescription?: string;
  /** Primary programming language */
  language?: string;
  /** Framework being used (e.g., React, Express) */
  framework?: string;
  /** Custom instructions to append */
  customInstructions?: string;
  /** Gate plan summary for verification requirements */
  gatePlanSummary?: string;
}

/**
 * Default CLAUDE.md template
 *
 * This file is read by Claude Code to understand project context and goals.
 */
export function getDefaultClaudeMd(vars: TemplateVars = {}): string {
  const {
    projectName = 'Project',
    taskDescription = 'Complete the assigned task following best practices.',
    language = '',
    framework = '',
    customInstructions = '',
    gatePlanSummary = '',
  } = vars;

  const sections: string[] = [];

  // Header
  sections.push(`# ${projectName}

## Goal

${taskDescription}`);

  // Tech stack if specified
  if (language || framework) {
    const techParts: string[] = [];
    if (language) techParts.push(`- **Language:** ${language}`);
    if (framework) techParts.push(`- **Framework:** ${framework}`);
    sections.push(`## Tech Stack

${techParts.join('\n')}`);
  }

  // Standard guidelines
  sections.push(`## Guidelines

- Write clean, maintainable code with clear naming
- Include appropriate error handling
- Add comments for complex logic
- Follow existing code patterns in the project
- Ensure all changes are properly tested`);

  // Gate plan requirements if provided
  if (gatePlanSummary) {
    sections.push(`## Verification Requirements

Your changes must pass the following verification gates:

${gatePlanSummary}`);
  }

  // Custom instructions if provided
  if (customInstructions) {
    sections.push(`## Additional Instructions

${customInstructions}`);
  }

  return sections.join('\n\n');
}

/**
 * Default .gitignore template
 */
export function getDefaultGitignore(language?: string): string {
  const common = `# Dependencies
node_modules/
vendor/
.venv/
venv/
__pycache__/

# Build outputs
dist/
build/
out/
*.o
*.pyc

# IDE/Editor
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
logs/

# Testing
coverage/
.nyc_output/

# Temp files
tmp/
temp/
*.tmp
`;

  const langSpecific: Record<string, string> = {
    typescript: `
# TypeScript
*.tsbuildinfo
`,
    javascript: `
# JavaScript
.eslintcache
`,
    python: `
# Python
*.egg-info/
.eggs/
*.egg
.pytest_cache/
.mypy_cache/
`,
    rust: `
# Rust
target/
Cargo.lock
`,
    go: `
# Go
go.sum
`,
  };

  return common + (language ? (langSpecific[language.toLowerCase()] ?? '') : '');
}

/**
 * Generate default seed files for a fresh workspace
 */
export function getDefaultSeedFiles(vars: TemplateVars = {}): SeedFile[] {
  return [
    {
      path: 'CLAUDE.md',
      content: getDefaultClaudeMd(vars),
    },
    {
      path: '.gitignore',
      content: getDefaultGitignore(vars.language),
    },
  ];
}

/**
 * Minimal seed files (just CLAUDE.md)
 */
export function getMinimalSeedFiles(vars: TemplateVars = {}): SeedFile[] {
  return [
    {
      path: 'CLAUDE.md',
      content: getDefaultClaudeMd(vars),
    },
  ];
}

/**
 * TypeScript project seed files
 */
export function getTypeScriptSeedFiles(vars: TemplateVars = {}): SeedFile[] {
  const tsVars = { ...vars, language: 'TypeScript' };

  return [
    {
      path: 'CLAUDE.md',
      content: getDefaultClaudeMd(tsVars),
    },
    {
      path: '.gitignore',
      content: getDefaultGitignore('typescript'),
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: vars.projectName?.toLowerCase().replace(/\s+/g, '-') ?? 'project',
          version: '0.1.0',
          type: 'module',
          scripts: {
            build: 'tsc',
            dev: 'tsc --watch',
            test: 'vitest run',
            lint: 'eslint src/',
          },
          devDependencies: {
            '@types/node': '^20.0.0',
            typescript: '^5.0.0',
            vitest: '^1.0.0',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            declaration: true,
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        },
        null,
        2
      ),
    },
    {
      path: 'src/index.ts',
      content: `/**
 * ${vars.projectName ?? 'Project'} entry point
 */

export function main(): void {
  console.log('Hello from ${vars.projectName ?? 'Project'}!');
}

main();
`,
    },
  ];
}

/**
 * Python project seed files
 */
export function getPythonSeedFiles(vars: TemplateVars = {}): SeedFile[] {
  const pyVars = { ...vars, language: 'Python' };

  return [
    {
      path: 'CLAUDE.md',
      content: getDefaultClaudeMd(pyVars),
    },
    {
      path: '.gitignore',
      content: getDefaultGitignore('python'),
    },
    {
      path: 'requirements.txt',
      content: '# Add your dependencies here\n',
    },
    {
      path: 'src/__init__.py',
      content: `"""${vars.projectName ?? 'Project'} package."""\n`,
    },
    {
      path: 'src/main.py',
      content: `"""${vars.projectName ?? 'Project'} entry point."""


def main() -> None:
    """Main entry point."""
    print("Hello from ${vars.projectName ?? 'Project'}!")


if __name__ == "__main__":
    main()
`,
    },
  ];
}
