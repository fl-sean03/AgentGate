// Work Order Types
export {
  WorkOrderStatus,
  IntegrationStatus,
  AgentType,
  GatePlanSource,
  WorkspaceTemplate,
  workspaceSourceSchema,
  executionPoliciesSchema,
  submitRequestSchema,
  listFiltersSchema,
  type WorkspaceSource,
  type LocalSource,
  type GitSource,
  type FreshSource,
  type GitHubSource,
  type GitHubNewSource,
  type ExecutionPolicies,
  type WorkOrder,
  type SubmitRequest,
  type ListFilters,
} from './work-order.js';

// Workspace Types
export {
  WorkspaceStatus,
  type Workspace,
  type Lease,
  type PathPolicy,
  type ValidationResult,
  type PathViolation,
} from './workspace.js';

// Run Types
export {
  RunState,
  RunEvent,
  RunResult,
  IterationErrorType,
  createIterationData,
  type Run,
  type IterationData,
  type RunStatus,
  type CIStatus,
} from './run.js';

// Snapshot Types
export {
  type BeforeState,
  type Snapshot,
  type CommitInfo,
  type DiffStats,
  type FileChange,
} from './snapshot.js';

// Gate Plan Types
export {
  RuntimeType,
  verifyProfileSchema,
  type EnvironmentSetup,
  type Command,
  type ContractCheck,
  type SchemaCheck,
  type SchemaRule,
  type BlackboxTest,
  type Assertion,
  type ExecutionPolicy,
  type GatePlan,
  type NamingRule,
  type VerifyProfile,
} from './gate-plan.js';

// Verification Types
export {
  VerificationLevel,
  type LevelResult,
  type CheckResult,
  type TestResult,
  type BlackboxResult,
  type AssertionResult,
  type Diagnostic,
  type VerificationReport,
  type CleanRoom,
  type CommandResult,
} from './verification.js';

// Agent Types
export {
  type AgentRequest,
  type AgentResult,
  type AgentStructuredOutput,
  type TokenUsage,
  type AgentConstraints,
  type ContextPointers,
  type DriverCapabilities,
  type AgentDriver,
  type SandboxInfo,
} from './agent.js';

// Feedback Types
export {
  FailureType,
  type Failure,
  type FileReference,
  type StructuredFeedback,
  type SuggestionPattern,
} from './feedback.js';

// Summary Types
export {
  type RunSummary,
  type StorageUsage,
  type CleanupResult,
  type RetentionPolicy,
  type DaemonStatus,
} from './summary.js';

// GitHub Types
export {
  gitHubConfigSchema,
  gitHubRepositorySchema,
  gitHubAuthResultSchema,
  gitHubPullRequestSchema,
  createRepositoryOptionsSchema,
  createPullRequestOptionsSchema,
  PullRequestState,
  GitHubError,
  GitHubErrorCode,
  type GitHubConfig,
  type GitHubRepository,
  type GitHubAuthResult,
  type GitHubPullRequest,
  type CreateRepositoryOptions,
  type CreatePullRequestOptions,
  type PushResult,
  type PullResult,
} from './github.js';

// Metrics Types
export {
  Phase,
  MetricsResult,
  phaseSchema,
  phaseMetricsSchema,
  levelMetricsSchema,
  iterationMetricsSchema,
  metricsResultSchema,
  runMetricsSchema,
  type PhaseMetrics,
  type LevelMetrics,
  type IterationMetrics,
  type RunMetrics,
  type MetricsDisplayOptions,
} from './metrics.js';

// Subscription Types
export {
  type SubscriptionType,
  type ClaudeOAuthCredentials,
  type ClaudeCredentials,
  type SubscriptionStatus,
  type SubscriptionValidation,
} from './subscription.js';

// Spawn Types
export {
  IntegrationStrategy,
  spawnLimitsSchema,
  childWorkOrderRequestSchema,
  spawnRequestSchema,
  type SpawnLimits,
  type ChildWorkOrderRequest,
  type SpawnRequest,
} from './spawn.js';

// Tree Metadata Types
export {
  TreeStatus,
  type TreeNode,
  type TreeMetadata,
} from './tree-metadata.js';

// Sandbox Types
export type {
  NetworkMode,
  ResourceLimits,
  SandboxConfig,
  SandboxStatus,
  ExecOptions,
  ExecResult,
  SandboxStats,
  Sandbox,
  SandboxProvider,
} from '../sandbox/types.js';

// Harness Config Types (v0.2.16)
export {
  LoopStrategyMode,
  CompletionDetection,
  ProgressTrackingMode,
  GitOperationMode,
  fixedStrategyConfigSchema,
  hybridStrategyConfigSchema,
  ralphStrategyConfigSchema,
  customStrategyConfigSchema,
  loopStrategyConfigSchema,
  agentDriverConfigSchema,
  verificationConfigSchema,
  gitOpsConfigSchema,
  executionLimitsSchema,
  harnessConfigSchema,
  type FixedStrategyConfig,
  type HybridStrategyConfig,
  type RalphStrategyConfig,
  type CustomStrategyConfig,
  type LoopStrategyConfig,
  type AgentDriverConfig,
  type VerificationConfig,
  type GitOpsConfig,
  type ExecutionLimits,
  type HarnessConfig,
  type ResolvedHarnessConfig,
  type ConfigSnapshot,
  type ConfigChange,
  type ConfigAuditRecord,
} from './harness-config.js';

// Loop Strategy Types (v0.2.16)
export type {
  LoopDecision,
  LoopProgress,
  ProgressMetrics,
  LoopDetectionData,
  SnapshotFingerprint,
  RepeatPattern,
  LoopState,
  IterationHistory,
  LoopContext,
  LoopStrategy,
  LoopStrategyFactory,
} from './loop-strategy.js';

// SDK Types (Claude Agent SDK)
export type {
  // Re-exported SDK types
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKToolProgressMessage,
  Query,
  SDKOptions,
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  CanUseTool,
  ModelUsage,
  NonNullableUsage,
  McpServerConfig,
  McpServerStatus,
  AgentDefinition,
  SandboxSettings,
  SandboxNetworkConfig,
  SandboxIgnoreViolations,
  SpawnOptions,
  SpawnedProcess,
  Transport,
  // AgentGate SDK wrapper types
  ClaudeAgentSDKDriverConfig,
  SDKHooksConfig,
  PreToolValidator,
  PostToolHandler,
  ToolCallRecord,
  SDKExecutionResult,
  SDKQueryParams,
  SDKSessionState,
  SDKStreamEvent,
} from './sdk.js';

// Persisted Results Types (v0.2.19 - Thrust 1)
export {
  DEFAULT_SAVE_OPTIONS,
  type PersistedAgentResult,
  type SaveAgentResultOptions,
} from './persisted-results.js';

// Build Error Types (v0.2.19 - Thrust 4)
export {
  BuildErrorType,
  BUILD_ERROR_DESCRIPTIONS,
  createBuildError,
  type BuildError,
} from './build-error.js';

// TaskSpec Types (v0.2.24)
export {
  taskMetadataSchema,
  desiredStateSchema,
  goalSpecSchema,
  isTaskSpec,
  isResolvedTaskSpec,
  type TaskMetadata,
  type DesiredState,
  type GoalSpec,
  type TaskSpecBody,
  type TaskSpec,
  type TaskSpecSource,
  type ResolvedTaskSpec,
} from './task-spec.js';

// Convergence Types (v0.2.24)
export {
  convergenceStrategyTypeSchema,
  convergenceConfigSchema,
  convergenceLimitsSchema,
  type ConvergenceStrategyType,
  type ConvergenceConfig,
  type ConvergenceLimits,
  type ConvergenceSpec,
  type ConvergenceState,
  type GateResult,
  type GateFailure,
  type ConvergenceIterationHistory,
  type ConvergenceDecision,
  type ConvergenceProgressMetrics,
  type GateProgress,
  type ConvergenceResult,
  type ConvergenceProgress,
} from './convergence.js';

// Gate Types (v0.2.24)
export {
  verificationLevelsCheckSchema,
  githubActionsCheckSchema,
  customCommandCheckSchema,
  approvalCheckSchema,
  convergenceCheckSchema,
  gateCheckSchema,
  backoffConfigSchema,
  feedbackConfigSchema,
  failurePolicySchema,
  successPolicySchema,
  gateConditionSchema,
  gateSchema,
  isVerificationLevelsCheck,
  isGitHubActionsCheck,
  isCustomCommandCheck,
  isApprovalCheck,
  isConvergenceCheck,
  type VerificationLevelsCheck,
  type GitHubActionsCheck,
  type CustomCommandCheck,
  type ApprovalCheck,
  type ConvergenceCheckType,
  type GateCheck,
  type GateCheckType,
  type BackoffConfig,
  type FeedbackConfig,
  type FailurePolicy,
  type SuccessPolicy,
  type GateCondition,
  type Gate,
  type FormattedFailure,
  type GateFeedback,
  type GatePipelineResult,
} from './gate.js';

// Execution Spec Types (v0.2.24)
export {
  gitCredentialsSchema,
  localWorkspaceSchema,
  gitWorkspaceSchema,
  githubWorkspaceSchema,
  githubNewWorkspaceSchema,
  freshWorkspaceSchema,
  workspaceSpecSchema,
  resourceSpecSchema,
  mountSpecSchema,
  sandboxSpecSchema,
  toolSpecSchema,
  mcpServerSpecSchema,
  agentCapabilitiesSchema,
  agentSpecSchema,
  executionSpecSchema,
  isLocalWorkspace,
  isGitWorkspace,
  isGitHubWorkspace,
  isGitHubNewWorkspace,
  isFreshWorkspace,
  type GitCredentials,
  type LocalWorkspace,
  type GitWorkspace,
  type GitHubWorkspace,
  type GitHubNewWorkspace,
  type FreshWorkspace,
  type WorkspaceTemplateType,
  type WorkspaceSpec,
  type SandboxProviderType,
  type SandboxNetworkMode,
  type ResourceSpec,
  type MountSpec,
  type SandboxSpec,
  type AgentDriverType,
  type ToolSpec,
  type MCPServerSpec,
  type AgentCapabilities,
  type AgentSpec,
  type ExecutionSpec,
} from './execution-spec.js';

// Delivery Spec Types (v0.2.24)
export {
  gitSpecSchema,
  autoMergeSpecSchema,
  prSpecSchema,
  slackNotificationSchema,
  webhookNotificationSchema,
  emailNotificationSchema,
  notificationConfigSchema,
  notificationSpecSchema,
  deliverySpecSchema,
  isSlackNotification,
  isWebhookNotification,
  isEmailNotification,
  type GitModeType,
  type GitSpec,
  type AutoMergeSpec,
  type PRSpec,
  type SlackNotification,
  type WebhookNotification,
  type EmailNotification,
  type NotificationConfig,
  type NotificationSpec,
  type DeliverySpec,
  type CommitResult,
  type PushResultType,
  type PRResult,
  type NotificationResult,
  type DeliveryResult,
} from './delivery-spec.js';
