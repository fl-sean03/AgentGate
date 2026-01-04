"""
Agent module for Campaign Builder.

This module provides the AI agent integration for:
    - Interactive campaign building
    - Natural language processing of user requests
    - Automated configuration suggestions
    - Orchestration runner for pipeline execution
    - Campaign planning and file generation
    - File analysis and FileGuide generation

Agent Abstraction Layer (v0.3.0):
    - AgentProvider: Abstract base for LLM adapters
    - AgentResult, ToolCall: Result types
    - ToolDefinition, ToolRegistry: Tool system
    - AnthropicAdapter, ClaudeSDKAdapter, MockAdapter: Provider adapters
    - LLMFileAnalyzer: LLM-enhanced file analysis
    - LLMCampaignPlanner: LLM-enhanced campaign planning
    - ResilientProvider: Reliability wrapper with retry/fallback

Exports:
    - FILE_ANALYZER_PROMPT: System prompt for FileAnalyzer agents
    - CAMPAIGN_PLANNER_PROMPT: System prompt for Campaign Planner agents
    - MAX_FILE_SIZE_LINES: Threshold for large file handling strategy
    - MAX_EXCERPT_CHARS: Maximum excerpt length in File Guides
    - run_campaign_builder: Main async function to run the pipeline
    - CampaignBuilderResult: Result dataclass for pipeline execution
    - run_campaign_planner: Campaign planning function
    - CampaignPlanResult: Result dataclass for campaign planning
    - AnalysisResult, BatchAnalysisResult: File analysis result dataclasses
    - pre_check_file, analyze_file, analyze_all_files: Analysis functions
    - discover_files, is_supported_file: File discovery functions
"""

from .prompts import (
    # Constants
    MAX_FILE_SIZE_LINES,
    MAX_EXCERPT_CHARS,
    # Prompts
    FILE_ANALYZER_PROMPT,
    CAMPAIGN_PLANNER_PROMPT,
    # Version info
    FILE_ANALYZER_PROMPT_VERSION,
    CAMPAIGN_PLANNER_PROMPT_VERSION,
)

from .runner import (
    # Main function
    run_campaign_builder,
    # Result dataclasses
    CampaignBuilderResult,
    GeneratedFile,
    ParameterSource,
    # Artifact writers
    write_campaign_readme,
    write_parameter_manifest,
    # Helpers
    create_failed_result,
    create_partial_success_report,
    with_timeout,
    discover_files,
    analyze_all_files,
    compute_file_hash,
    # Progress callback type
    ProgressCallback,
    # Stage constants
    STAGE_DISCOVERING,
    STAGE_ANALYZING,
    STAGE_PLANNING,
    STAGE_VALIDATING,
    STAGE_FINALIZING,
    STAGE_COMPLETE,
)

from .campaign_planner import (
    # Dataclasses (with Planner prefix to avoid conflicts)
    GeneratedFile as PlannerGeneratedFile,
    ParameterSource as PlannerParameterSource,
    CampaignPlanResult,
    # File guide formatting
    format_file_guides_for_agent,
    # Prompt building
    build_campaign_planner_prompt,
    # Engine detection and file discovery
    detect_engine_from_file,
    infer_file_purpose,
    discover_generated_files,
    # Validation integration
    format_repair_request,
    is_unfixable_error,
    validate_and_repair,
    create_validation_summary,
    create_missing_info_report,
    # LAMMPS generation
    generate_lammps_input,
    # Main function
    run_campaign_planner,
)

from .file_analyzer import (
    # Result types
    AnalysisResult,
    BatchAnalysisResult,
    # Pre-check functions
    pre_check_file,
    # File utilities
    compute_file_hash as file_analyzer_compute_hash,
    is_supported_file,
    # Analysis functions
    analyze_file,
    analyze_all_files as file_analyzer_analyze_all,
    # Discovery
    discover_files as file_analyzer_discover_files,
    # Tool helpers
    get_file_analyzer_tools,
    assess_batch_result,
    # Constants
    MAX_FILE_SIZE_BYTES,
    SUPPORTED_EXTENSIONS,
    DEFAULT_EXCLUDE_PATTERNS,
)

__all__ = [
    # Constants
    "MAX_FILE_SIZE_LINES",
    "MAX_EXCERPT_CHARS",
    # Prompts
    "FILE_ANALYZER_PROMPT",
    "CAMPAIGN_PLANNER_PROMPT",
    # Version info
    "FILE_ANALYZER_PROMPT_VERSION",
    "CAMPAIGN_PLANNER_PROMPT_VERSION",
    # Runner - Main function
    "run_campaign_builder",
    # Runner - Result dataclasses
    "CampaignBuilderResult",
    "GeneratedFile",
    "ParameterSource",
    # Runner - Artifact writers
    "write_campaign_readme",
    "write_parameter_manifest",
    # Runner - Helpers
    "create_failed_result",
    "create_partial_success_report",
    "with_timeout",
    "discover_files",
    "analyze_all_files",
    "compute_file_hash",
    # Runner - Progress callback type
    "ProgressCallback",
    # Runner - Stage constants
    "STAGE_DISCOVERING",
    "STAGE_ANALYZING",
    "STAGE_PLANNING",
    "STAGE_VALIDATING",
    "STAGE_FINALIZING",
    "STAGE_COMPLETE",
    # Campaign Planner - Dataclasses
    "PlannerGeneratedFile",
    "PlannerParameterSource",
    "CampaignPlanResult",
    # Campaign Planner - Functions
    "format_file_guides_for_agent",
    "build_campaign_planner_prompt",
    "detect_engine_from_file",
    "infer_file_purpose",
    "discover_generated_files",
    "format_repair_request",
    "is_unfixable_error",
    "validate_and_repair",
    "create_validation_summary",
    "create_missing_info_report",
    "generate_lammps_input",
    "run_campaign_planner",
    # File Analyzer - Result types
    "AnalysisResult",
    "BatchAnalysisResult",
    # File Analyzer - Pre-check functions
    "pre_check_file",
    # File Analyzer - File utilities
    "file_analyzer_compute_hash",
    "is_supported_file",
    # File Analyzer - Analysis functions
    "analyze_file",
    "file_analyzer_analyze_all",
    # File Analyzer - Discovery
    "file_analyzer_discover_files",
    # File Analyzer - Tool helpers
    "get_file_analyzer_tools",
    "assess_batch_result",
    # File Analyzer - Constants
    "MAX_FILE_SIZE_BYTES",
    "SUPPORTED_EXTENSIONS",
    "DEFAULT_EXCLUDE_PATTERNS",
    # Agent Abstraction Layer - Interface
    "AgentConfig",
    "AgentProvider",
    "AgentResult",
    "ToolCall",
    # Agent Abstraction Layer - Tools
    "ToolDefinition",
    "ToolError",
    "ToolRegistry",
    "default_registry",
    # Agent Abstraction Layer - Factory
    "get_provider",
    "get_best_available_provider",
    # Agent Abstraction Layer - Adapters
    "MockAdapter",
    # Agent Abstraction Layer - LLM Integration
    "LLMFileAnalyzer",
    "LLMAnalysisResult",
    "LLMCampaignPlanner",
    "LLMPlanResult",
    # Agent Abstraction Layer - Reliability
    "RetryConfig",
    "ProviderChain",
    "ResilientProvider",
    "create_resilient_provider",
]

# Import Agent Abstraction Layer components
from .interface import (
    AgentConfig,
    AgentProvider,
    AgentResult,
    ToolCall,
)

from .tool_types import (
    ToolDefinition,
    ToolError,
)

from .registry import (
    ToolRegistry,
    default_registry,
)

from .factory import (
    get_provider,
    get_best_available_provider,
)

from .adapters.mock import MockAdapter

from .llm_analyzer import (
    LLMFileAnalyzer,
    LLMAnalysisResult,
)

from .llm_planner import (
    LLMCampaignPlanner,
    LLMPlanResult,
)

from .reliability import (
    RetryConfig,
    ProviderChain,
    ResilientProvider,
    create_resilient_provider,
)
