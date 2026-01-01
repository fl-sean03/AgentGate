/**
 * Agent Driver Module
 *
 * Provides the infrastructure for executing AI coding agents with
 * configurable constraints, tool restrictions, and output parsing.
 *
 * Available Drivers:
 * - ClaudeAgentSDKDriver - Uses Claude Agent SDK with API key (direct API)
 * - ClaudeCodeDriver - Uses Claude Code CLI with API key
 * - ClaudeCodeSubscriptionDriver - Uses Claude Code CLI with Pro/Max subscription
 * - OpenAICodexDriver - Uses OpenAI Codex CLI
 * - OpenCodeDriver - Uses SST OpenCode CLI
 */

// Re-export types
export type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  AgentStructuredOutput,
  AgentConstraints,
  ContextPointers,
  DriverCapabilities,
  TokenUsage,
} from './driver.js';

// Registry
export {
  driverRegistry,
  register,
  get,
  list,
  getDefault,
  setDefault,
  has,
  unregister,
  clear,
} from './registry.js';

// Constraints
export {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
  DEFAULT_CONSTRAINTS,
  mergeConstraints,
  validateConstraints,
  createMinimalConstraints,
  createPermissiveConstraints,
  type ConstraintValidationResult,
} from './constraints.js';

// Defaults
export {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  MAX_TURNS_LIMIT,
  DEFAULT_AGENT_CONSTRAINTS,
  EMPTY_CONTEXT_POINTERS,
  CLAUDE_CODE_CAPABILITIES,
  createDefaultRequest,
  buildGatePlanSystemPrompt,
  buildFeedbackSystemPrompt,
} from './defaults.js';

// Command builder
export {
  buildPrompt,
  buildSystemPromptAppend,
  buildClaudeCommand,
  buildCommandString,
} from './command-builder.js';

// Output parser
export {
  parseOutput,
  extractSessionId,
  extractTokenUsage,
  extractResult,
  isErrorOutput,
  extractErrorMessage,
} from './output-parser.js';

// Claude Code driver (uses API key)
export {
  ClaudeCodeDriver,
  createClaudeCodeDriver,
  type ClaudeCodeDriverConfig,
} from './claude-code-driver.js';

// Claude Code Subscription driver (uses Pro/Max subscription)
export {
  ClaudeCodeSubscriptionDriver,
  createClaudeCodeSubscriptionDriver,
  tryCreateSubscriptionDriver,
  SUBSCRIPTION_CAPABILITIES,
  type ClaudeCodeSubscriptionDriverConfig,
  type SubscriptionCapabilities,
} from './claude-code-subscription-driver.js';

// OpenAI Codex driver
export {
  OpenAICodexDriver,
  createOpenAICodexDriver,
  type OpenAICodexDriverConfig,
  type CodexAgentResult,
} from './openai-codex-driver.js';

// OpenCode driver (SST open source)
export {
  OpenCodeDriver,
  createOpenCodeDriver,
  type OpenCodeDriverConfig,
  type OpenCodeResult,
} from './opencode-driver.js';

// Claude Agent SDK driver (direct API)
export {
  ClaudeAgentSDKDriver,
  createClaudeAgentSDKDriver,
  tryCreateSDKDriver,
  SDK_DRIVER_CAPABILITIES,
  type ClaudeAgentSDKDriverConfig,
} from './claude-agent-sdk-driver.js';

// SDK Message Parser
export {
  MessageCollector,
  buildAgentResult,
  buildSDKStructuredOutput,
  isSystemMessage,
  isAssistantMessage,
  isToolUseMessage,
  isToolResultMessage,
  isResultMessage,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKAssistantMessage,
  type SDKToolUseMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
  type SDKStructuredOutput,
  type ToolCallRecord,
} from './sdk-message-parser.js';

// SDK Options Builder
export {
  buildSDKOptions,
  getRequiredConfig,
  type SDKQueryOptions,
  type SDKHooksConfig,
  type HooksConfig,
  type PreToolUseHook,
  type PostToolUseHook,
  type HookResult,
  type HookFilter,
} from './sdk-options-builder.js';

// SDK Hooks
export {
  FileChangeTracker,
  createToolLoggerHook,
  createFileChangeTrackerHook,
  createDangerousToolBlocker,
  createPathRestrictionHook,
  buildHooksConfig,
  createGateIntegrationHooks,
  mergeHooksConfig,
  type FileChangeRecord,
  type GateConfig,
} from './sdk-hooks.js';

// Subscription detection
export {
  getCredentialsPath,
  credentialsExist,
  parseCredentials,
  isTokenExpired,
  isValidSubscriptionType,
  validateSubscription,
  detectSubscription,
  getSubscriptionCredentials,
} from './subscription-detector.js';

// Initialize and register drivers
import { ClaudeCodeDriver } from './claude-code-driver.js';
import { ClaudeCodeSubscriptionDriver } from './claude-code-subscription-driver.js';
import { OpenAICodexDriver } from './openai-codex-driver.js';
import { OpenCodeDriver } from './opencode-driver.js';
import { ClaudeAgentSDKDriver } from './claude-agent-sdk-driver.js';
import { register, setDefault } from './registry.js';

// Auto-register all drivers
// Claude Agent SDK driver (uses ANTHROPIC_API_KEY for billing via direct API)
const sdkDriver = new ClaudeAgentSDKDriver();
register(sdkDriver);

// Claude Code API driver (uses ANTHROPIC_API_KEY for billing via CLI)
const claudeCodeDriver = new ClaudeCodeDriver();
register(claudeCodeDriver);

// Claude Code Subscription driver is the default (uses Max/Pro subscription)
// This saves API credits by using the user's subscription quota
const subscriptionDriver = new ClaudeCodeSubscriptionDriver();
register(subscriptionDriver);
setDefault('claude-code-subscription');

// Register OpenAI Codex driver (available when OPENAI_API_KEY is set)
const codexDriver = new OpenAICodexDriver();
register(codexDriver);

// Register OpenCode driver (available when opencode is installed)
const openCodeDriver = new OpenCodeDriver();
register(openCodeDriver);
