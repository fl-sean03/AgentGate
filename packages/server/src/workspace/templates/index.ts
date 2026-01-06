/**
 * Workspace Templates Module
 *
 * Provides a flexible template system for creating workspaces with
 * different configurations, project types, and customizations.
 */

// Export types
export type {
  TemplateSourceType,
  BaseTemplateSource,
  InlineTemplateSource,
  DirectoryTemplateSource,
  GitTemplateSource,
  UrlTemplateSource,
  TemplateSource,
  TemplateVariable,
  TemplateHook,
  WorkspaceTemplate,
  TemplateCreateOptions,
  TemplateCreateResult,
  TemplateLoader,
  ListTemplatesOptions,
} from './types.js';

// Export registry
export {
  TemplateRegistry,
  defaultTemplateRegistry,
} from './registry.js';

// Export resolver
export {
  TemplateResolver,
  defaultResolver,
} from './resolver.js';

// Export loaders
export {
  BaseTemplateLoader,
  InlineTemplateLoader,
  inlineLoader,
  DirectoryTemplateLoader,
  directoryLoader,
  GitTemplateLoader,
  gitLoader,
  UrlTemplateLoader,
  urlLoader,
  getLoader,
  registerLoader,
} from './loaders/index.js';

// Built-in templates
import type { WorkspaceTemplate } from './types.js';
import { defaultTemplateRegistry } from './registry.js';

/**
 * Built-in minimal template
 */
export const minimalTemplate: WorkspaceTemplate = {
  id: 'minimal',
  name: 'Minimal',
  description: 'A minimal workspace with just a README',
  version: '1.0.0',
  builtIn: true,
  tags: ['minimal', 'empty'],
  source: {
    type: 'inline',
    files: {
      'README.md': '# Workspace\n\nThis is a minimal workspace.\n',
      '.gitignore': 'node_modules/\n.env\n*.log\n',
    },
  },
};

/**
 * Built-in TypeScript template
 */
export const typescriptTemplate: WorkspaceTemplate = {
  id: 'typescript',
  name: 'TypeScript',
  description: 'A TypeScript project with Node.js',
  version: '1.0.0',
  builtIn: true,
  tags: ['typescript', 'node'],
  defaultHarness: 'npm test',
  source: {
    type: 'inline',
    files: {
      'package.json': JSON.stringify(
        {
          name: '{{PROJECT_NAME}}',
          version: '1.0.0',
          type: 'module',
          scripts: {
            build: 'tsc',
            test: 'jest',
            start: 'node dist/index.js',
          },
          devDependencies: {
            '@types/jest': '^29.5.0',
            '@types/node': '^20.0.0',
            jest: '^29.5.0',
            'ts-jest': '^29.1.0',
            typescript: '^5.0.0',
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            esModuleInterop: true,
            strict: true,
            outDir: './dist',
            rootDir: './src',
            declaration: true,
            skipLibCheck: true,
          },
          include: ['src/**/*'],
        },
        null,
        2
      ),
      'jest.config.js':
        'export default {\n  preset: "ts-jest/presets/default-esm",\n  testEnvironment: "node",\n  extensionsToTreatAsEsm: [".ts"],\n  moduleNameMapper: {\n    "^(\\\\.{1,2}/.*)\\\\.js$": "$1",\n  },\n};\n',
      'src/index.ts': '// Entry point\nconsole.log("Hello from TypeScript!");\n',
      'src/index.test.ts':
        'describe("Example", () => {\n  it("should pass", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n',
      'README.md': '# {{PROJECT_NAME}}\n\nA TypeScript project.\n\n## Getting Started\n\n```bash\nnpm install\nnpm run build\nnpm start\n```\n',
      '.gitignore': 'node_modules/\ndist/\n.env\n*.log\n',
    },
  },
  variables: [
    {
      name: 'PROJECT_NAME',
      description: 'The name of the project',
      type: 'string',
      default: 'my-typescript-project',
    },
  ],
  hooks: [
    {
      when: 'after',
      command: 'npm install',
      continueOnError: true,
      timeoutMs: 120000,
    },
  ],
};

/**
 * Built-in Python template
 */
export const pythonTemplate: WorkspaceTemplate = {
  id: 'python',
  name: 'Python',
  description: 'A Python project with pytest',
  version: '1.0.0',
  builtIn: true,
  tags: ['python'],
  defaultHarness: 'pytest',
  source: {
    type: 'inline',
    files: {
      'requirements.txt': 'pytest>=7.0.0\npytest-cov>=4.0.0\n',
      'setup.py':
        'from setuptools import setup, find_packages\n\nsetup(\n    name="{{PROJECT_NAME}}",\n    version="1.0.0",\n    packages=find_packages(),\n)\n',
      'src/__init__.py': '',
      'src/main.py': '"""Main module."""\n\n\ndef hello() -> str:\n    """Return a greeting."""\n    return "Hello from Python!"\n\n\nif __name__ == "__main__":\n    print(hello())\n',
      'tests/__init__.py': '',
      'tests/test_main.py':
        '"""Tests for main module."""\nimport pytest\nfrom src.main import hello\n\n\ndef test_hello():\n    """Test hello function."""\n    assert hello() == "Hello from Python!"\n',
      'pytest.ini': '[pytest]\ntestpaths = tests\npython_files = test_*.py\n',
      'README.md':
        '# {{PROJECT_NAME}}\n\nA Python project.\n\n## Getting Started\n\n```bash\npip install -r requirements.txt\npython -m src.main\n```\n\n## Testing\n\n```bash\npytest\n```\n',
      '.gitignore':
        '__pycache__/\n*.py[cod]\n*$py.class\n.pytest_cache/\n.coverage\nhtmlcov/\ndist/\nbuild/\n*.egg-info/\n.env\nvenv/\n',
    },
  },
  variables: [
    {
      name: 'PROJECT_NAME',
      description: 'The name of the project',
      type: 'string',
      default: 'my-python-project',
    },
  ],
  hooks: [
    {
      when: 'after',
      command: 'pip install -r requirements.txt',
      continueOnError: true,
      timeoutMs: 120000,
    },
  ],
};

/**
 * Register all built-in templates
 */
export function registerBuiltInTemplates(): void {
  defaultTemplateRegistry.register(minimalTemplate);
  defaultTemplateRegistry.register(typescriptTemplate);
  defaultTemplateRegistry.register(pythonTemplate);
}

// Auto-register built-in templates
registerBuiltInTemplates();
