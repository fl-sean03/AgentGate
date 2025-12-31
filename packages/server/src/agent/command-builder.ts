import type { AgentRequest } from '../types/index.js';
import type { SpawnLimits } from '../types/spawn.js';
import { buildFeedbackSystemPrompt, buildGatePlanSystemPrompt } from './defaults.js';
import { loadEngineeringStandards } from './standards.js';

/**
 * Builds the full prompt including context and constraints
 */
export function buildPrompt(request: AgentRequest): string {
  const parts: string[] = [];

  // Main task prompt
  parts.push(request.taskPrompt);

  // Add context pointers if available
  const contextSection = buildContextSection(request);
  if (contextSection) {
    parts.push(contextSection);
  }

  return parts.join('\n\n');
}

/**
 * Builds the context section with file pointers
 */
function buildContextSection(request: AgentRequest): string | null {
  const { contextPointers } = request;
  const pointers: string[] = [];

  if (contextPointers.manifestPath) {
    pointers.push(`- Project manifest: ${contextPointers.manifestPath}`);
  }
  if (contextPointers.testsPath) {
    pointers.push(`- Tests location: ${contextPointers.testsPath}`);
  }
  if (contextPointers.docsPath) {
    pointers.push(`- Documentation: ${contextPointers.docsPath}`);
  }
  if (contextPointers.gatePlanPath) {
    pointers.push(`- Gate plan: ${contextPointers.gatePlanPath}`);
  }
  if (contextPointers.srcPath) {
    pointers.push(`- Source code: ${contextPointers.srcPath}`);
  }

  if (pointers.length === 0) {
    return null;
  }

  return `## Context\n\nRelevant project files:\n${pointers.join('\n')}`;
}

/**
 * Builds spawn instructions for the agent system prompt.
 *
 * @param limits - Spawn limits to include in instructions
 * @param workOrderId - Current work order ID to include in format example
 * @returns Formatted spawn instructions
 */
export function buildSpawnInstructions(limits: SpawnLimits, workOrderId?: string | null): string {
  const workOrderIdExample = workOrderId || '<current-work-order-id>';
  return `## Spawning Child Agents (Optional)

If a task is too complex to complete in one session, you may decompose it into subtasks
by creating \`.agentgate/spawn-requests.json\` in the workspace root.

**Format:**
\`\`\`json
{
  "parentWorkOrderId": "${workOrderIdExample}",
  "children": [
    {
      "taskPrompt": "Description of the subtask",
      "siblingIndex": 0,
      "integrationStrategy": "manual",
      "maxIterations": 3,
      "maxWallClockSeconds": 3600
    }
  ]
}
\`\`\`

**Guidelines:**
- Only spawn when genuinely needed (task too complex for single session)
- Keep subtasks independent when possible
- Each child should be testable in isolation
- Maximum **${limits.maxChildren}** children per parent
- Maximum **${limits.maxDepth}** levels of nesting
- Total tree size limited to **${limits.maxTotalDescendants}** work orders

**Integration Strategies:**
- \`manual\`: You manually integrate changes (default)
- \`auto-merge\`: System auto-merges child branches
- \`auto-squash\`: System squashes child commits
- \`custom\`: Custom integration logic

After creating spawn-requests.json, your current iteration will pause.
Children will execute in parallel, and results can be integrated as needed.`;
}

/**
 * Builds the system prompt appendix for constraints and feedback
 */
export function buildSystemPromptAppend(request: AgentRequest): string | null {
  // Load engineering standards at the start
  const standards = loadEngineeringStandards(request.workspacePath);

  const parts: string[] = [];

  // Prepend standards to the parts array (before gate plan, feedback)
  if (standards) {
    parts.push(standards);
  }

  // Add gate plan requirements
  if (request.gatePlanSummary) {
    const gatePlanPrompt = buildGatePlanSystemPrompt(request.gatePlanSummary);
    if (gatePlanPrompt) {
      parts.push(gatePlanPrompt);
    }
  }

  // Add prior feedback if present
  if (request.priorFeedback) {
    const feedbackPrompt = buildFeedbackSystemPrompt(request.priorFeedback);
    if (feedbackPrompt) {
      parts.push(feedbackPrompt);
    }
  }

  // Add spawn instructions if enabled
  if (request.spawnLimits) {
    const spawnInstructions = buildSpawnInstructions(request.spawnLimits, request.workOrderId);
    if (spawnInstructions) {
      parts.push(spawnInstructions);
    }
  }

  // Add custom system prompt
  if (request.constraints.additionalSystemPrompt) {
    parts.push(request.constraints.additionalSystemPrompt);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join('\n\n');
}

/**
 * Builds Claude Code CLI arguments from an AgentRequest
 */
export function buildClaudeCommand(request: AgentRequest): string[] {
  const args: string[] = [];

  // Add the prompt with -p flag
  const prompt = buildPrompt(request);
  args.push('-p', prompt);

  // Request JSON output
  args.push('--output-format', 'json');

  // Set max turns
  args.push('--max-turns', String(request.constraints.maxTurns));

  // Add allowed tools if specified
  if (request.constraints.allowedTools.length > 0) {
    args.push('--allowedTools', request.constraints.allowedTools.join(','));
  }

  // Add disallowed tools if specified
  if (request.constraints.disallowedTools.length > 0) {
    args.push(
      '--disallowedTools',
      request.constraints.disallowedTools.join(',')
    );
  }

  // Add system prompt appendix
  const systemAppend = buildSystemPromptAppend(request);
  if (systemAppend) {
    args.push('--append-system-prompt', systemAppend);
  }

  // Handle session resume
  if (request.sessionId) {
    args.push('--resume', request.sessionId);
  }

  // Add permission mode based dangerously bypass (if needed)
  // Note: This requires careful consideration of security implications
  if (request.constraints.permissionMode === 'bypassPermissions') {
    args.push('--dangerously-skip-permissions');
  }

  return args;
}

/**
 * Builds the full command string (for logging/debugging)
 */
export function buildCommandString(request: AgentRequest): string {
  const args = buildClaudeCommand(request);
  // Escape arguments that contain spaces or special characters
  const escapedArgs = args.map((arg) => {
    if (arg.includes(' ') || arg.includes('"') || arg.includes('\n')) {
      return `"${arg.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return arg;
  });
  return `claude ${escapedArgs.join(' ')}`;
}
