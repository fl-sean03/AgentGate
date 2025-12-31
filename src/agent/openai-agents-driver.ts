/**
 * OpenAI Agents SDK Driver
 *
 * Agent driver implementation using the OpenAI Agents SDK.
 * This provides a provider-agnostic agent framework with custom tools.
 */

import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { DEFAULT_TIMEOUT_MS } from './defaults.js';

const execAsync = promisify(exec);
const logger = createLogger('agent:agents-driver');

/**
 * OpenAI Agents driver configuration
 */
export interface OpenAIAgentsDriverConfig {
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Model to use (default: from OPENAI_API_MODEL env or gpt-4o) */
  model?: string;
  /** Enable debug logging */
  debugMode?: boolean;
}

/**
 * Extended agent result with Agents SDK-specific data
 */
export interface AgentsSDKResult extends AgentResult {
  /** Number of turns taken */
  numTurns?: number;
}

/**
 * Agents SDK driver capabilities
 */
const AGENTS_SDK_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: false, // Stateless by default
  supportsStructuredOutput: true,
  supportsToolRestriction: true, // We define the tools
  supportsTimeout: true,
  maxTurns: 50,
};

/**
 * Creates workspace-scoped file tools for the agent
 */
function createFileTools(workspacePath: string): ReturnType<typeof tool>[] {
  const readFileTool = tool({
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: z.object({
      path: z.string().describe('Relative path to the file'),
    }),
    execute: async (input) => {
      try {
        const fullPath = path.join(workspacePath, input.path);
        // Security: ensure path is within workspace
        if (!fullPath.startsWith(workspacePath)) {
          return 'Error: Path outside workspace';
        }
        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  const writeFileTool = tool({
    name: 'write_file',
    description: 'Write content to a file',
    parameters: z.object({
      path: z.string().describe('Relative path to the file'),
      content: z.string().describe('Content to write'),
    }),
    execute: async (input) => {
      try {
        const fullPath = path.join(workspacePath, input.path);
        // Security: ensure path is within workspace
        if (!fullPath.startsWith(workspacePath)) {
          return 'Error: Path outside workspace';
        }
        // Create directory if needed
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, input.content, 'utf-8');
        return `Successfully wrote to ${input.path}`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  const listFilesTool = tool({
    name: 'list_files',
    description: 'List files in a directory',
    parameters: z.object({
      path: z.string().describe('Relative path to the directory').default('.'),
    }),
    execute: async (input) => {
      try {
        const fullPath = path.join(workspacePath, input.path);
        if (!fullPath.startsWith(workspacePath)) {
          return 'Error: Path outside workspace';
        }
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const result = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
        return result.join('\n');
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  const runCommandTool = tool({
    name: 'run_command',
    description: 'Run a shell command in the workspace',
    parameters: z.object({
      command: z.string().describe('The command to run'),
    }),
    execute: async (input) => {
      try {
        const { stdout, stderr } = await execAsync(input.command, {
          cwd: workspacePath,
          timeout: 60000, // 1 minute timeout for commands
        });
        return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  return [readFileTool, writeFileTool, listFilesTool, runCommandTool];
}

/**
 * OpenAI Agents SDK driver implementation
 */
export class OpenAIAgentsDriver implements AgentDriver {
  readonly name = 'openai-agents';
  readonly version = '1.0.0';

  private readonly config: Required<OpenAIAgentsDriverConfig>;

  constructor(config: OpenAIAgentsDriverConfig = {}) {
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      model: config.model ?? process.env.OPENAI_API_MODEL ?? 'gpt-4o',
      debugMode: config.debugMode ?? false,
    };
  }

  /**
   * Checks if the Agents SDK is available
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Interface requires Promise, check is sync
  async isAvailable(): Promise<boolean> {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      logger.debug('OPENAI_API_KEY not set, Agents SDK driver not available');
      return false;
    }

    try {
      // The SDK should be available if import worked
      logger.debug('Agents SDK availability check: succeeded');
      return true;
    } catch (error) {
      logger.debug({ error }, 'Agents SDK not available');
      return false;
    }
  }

  /**
   * Returns the capabilities of this driver
   */
  getCapabilities(): DriverCapabilities {
    return { ...AGENTS_SDK_CAPABILITIES };
  }

  /**
   * Executes an agent request using the Agents SDK
   */
  async execute(request: AgentRequest): Promise<AgentsSDKResult> {
    const startTime = Date.now();
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        model: this.config.model,
        timeout,
      },
      'Executing Agents SDK request'
    );

    // Create workspace-scoped tools
    const tools = createFileTools(request.workspacePath);

    // Build instructions
    const instructions = this.buildInstructions(request);

    // Create agent
    const agent = new Agent({
      name: 'AgentGate-Coder',
      instructions,
      tools,
    });

    logger.debug(
      {
        instructionsLength: instructions.length,
        toolCount: tools.length,
      },
      'Agent configured'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null;
    let lastError: Error | null = null;

    try {
      // Execute with timeout using AbortController pattern
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);

      try {
        result = await run(agent, request.taskPrompt, {
          maxTurns: request.constraints.maxTurns,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (abortController.signal.aborted) {
        throw new Error(`Timeout after ${timeout}ms`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: lastError.message }, 'Agents SDK execution failed');
    }

    const durationMs = Date.now() - startTime;

    // Build result
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- SDK return type is not fully typed
    const finalOutput = result?.finalOutput ?? '';
    const agentResult: AgentsSDKResult = {
      success: !lastError && !!finalOutput,
      exitCode: lastError ? 1 : 0,
      stdout: typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput),
      stderr: lastError?.message ?? '',
      structuredOutput: finalOutput ? { result: String(finalOutput) } : null,
      sessionId: null, // Agents SDK is stateless
      tokensUsed: null, // Could extract from result if available
      durationMs,
    };

    logger.info(
      {
        success: agentResult.success,
        durationMs,
        outputLength: agentResult.stdout.length,
      },
      'Agents SDK execution completed'
    );

    return agentResult;
  }

  /**
   * Builds the agent instructions from request context
   */
  private buildInstructions(request: AgentRequest): string {
    const parts: string[] = [];

    parts.push('You are a coding assistant working in a project workspace.');
    parts.push(`Working directory: ${request.workspacePath}`);
    parts.push('');
    parts.push('Available tools:');
    parts.push('- read_file: Read file contents');
    parts.push('- write_file: Create or update files');
    parts.push('- list_files: List directory contents');
    parts.push('- run_command: Execute shell commands');
    parts.push('');

    // Add gate plan context if present
    if (request.gatePlanSummary) {
      parts.push('## Requirements');
      parts.push(request.gatePlanSummary);
      parts.push('');
    }

    // Add prior feedback if present
    if (request.priorFeedback) {
      parts.push('## Prior Feedback');
      parts.push('Please address these issues:');
      parts.push(request.priorFeedback);
      parts.push('');
    }

    // Add additional system prompt if present
    if (request.constraints.additionalSystemPrompt) {
      parts.push('## Additional Guidelines');
      parts.push(request.constraints.additionalSystemPrompt);
      parts.push('');
    }

    return parts.join('\n');
  }
}

/**
 * Creates a new OpenAI Agents SDK driver instance
 */
export function createOpenAIAgentsDriver(
  config?: OpenAIAgentsDriverConfig
): OpenAIAgentsDriver {
  return new OpenAIAgentsDriver(config);
}
