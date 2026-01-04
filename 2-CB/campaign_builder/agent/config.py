"""
Configuration System for Campaign Builder Agent Layer.

This module handles loading configuration from environment variables
and .env files for the agent system.

Components:
    - AgentEnvironment: Configuration loaded from environment
    - load_config: Function to load configuration
    - ConfigurationError: Exception for configuration issues
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Try to import python-dotenv
try:
    from dotenv import load_dotenv
    HAS_DOTENV = True
except ImportError:
    HAS_DOTENV = False


logger = logging.getLogger(__name__)


# =============================================================================
# Exceptions
# =============================================================================


class ConfigurationError(Exception):
    """Exception raised for configuration errors.

    Attributes:
        message: Error description
        config_key: The configuration key that caused the error (if applicable)
    """

    def __init__(self, message: str, config_key: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.config_key = config_key


# =============================================================================
# Configuration Dataclass
# =============================================================================


@dataclass
class AgentEnvironment:
    """Configuration loaded from environment variables.

    All values can be set via environment variables or .env file.

    Attributes:
        provider: Which LLM provider to use (claude_sdk, anthropic, mock)
        api_key: Anthropic API key (required for claude_sdk and anthropic)
        model: Model identifier
        max_iterations: Maximum tool-calling rounds
        timeout: Timeout in seconds
        max_tokens: Maximum response tokens
        temperature: Sampling temperature
        working_directory: Directory for file operations
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
    """
    provider: str = "claude_sdk"
    api_key: Optional[str] = None
    model: str = "claude-sonnet-4-20250514"
    max_iterations: int = 10
    timeout: int = 120
    max_tokens: int = 4096
    temperature: float = 0.0
    working_directory: Path = Path.cwd()
    log_level: str = "INFO"

    # Engine paths (for L2 validation)
    lammps_binary: Optional[str] = None
    qe_binary: Optional[str] = None

    def validate(self) -> None:
        """Validate the configuration.

        Raises:
            ConfigurationError: If configuration is invalid
        """
        # Validate provider
        valid_providers = {"claude_sdk", "anthropic", "mock"}
        if self.provider not in valid_providers:
            raise ConfigurationError(
                f"Invalid provider '{self.provider}'. Must be one of: {valid_providers}",
                config_key="AGENT_PROVIDER"
            )

        # Validate API key for non-mock providers
        if self.provider != "mock" and not self.api_key:
            raise ConfigurationError(
                f"API key required for provider '{self.provider}'. Set ANTHROPIC_API_KEY.",
                config_key="ANTHROPIC_API_KEY"
            )

        # Validate max_iterations
        if self.max_iterations < 1:
            raise ConfigurationError(
                f"max_iterations must be positive, got {self.max_iterations}",
                config_key="AGENT_MAX_ITERATIONS"
            )

        # Validate timeout
        if self.timeout < 1:
            raise ConfigurationError(
                f"timeout must be positive, got {self.timeout}",
                config_key="AGENT_TIMEOUT"
            )

        # Validate max_tokens
        if self.max_tokens < 1:
            raise ConfigurationError(
                f"max_tokens must be positive, got {self.max_tokens}",
                config_key="AGENT_MAX_TOKENS"
            )

        # Validate temperature
        if not 0.0 <= self.temperature <= 2.0:
            raise ConfigurationError(
                f"temperature must be between 0.0 and 2.0, got {self.temperature}",
                config_key="AGENT_TEMPERATURE"
            )

    def to_agent_config(self):
        """Convert to AgentConfig for use with providers.

        Returns:
            AgentConfig instance
        """
        from .interface import AgentConfig
        return AgentConfig(
            max_iterations=self.max_iterations,
            timeout=self.timeout,
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            working_directory=str(self.working_directory),
        )


# =============================================================================
# Configuration Loading
# =============================================================================


def _get_env_int(key: str, default: int) -> int:
    """Get an integer from environment."""
    value = os.environ.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        logger.warning(f"Invalid integer for {key}: {value}, using default {default}")
        return default


def _get_env_float(key: str, default: float) -> float:
    """Get a float from environment."""
    value = os.environ.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        logger.warning(f"Invalid float for {key}: {value}, using default {default}")
        return default


def _get_env_bool(key: str, default: bool) -> bool:
    """Get a boolean from environment."""
    value = os.environ.get(key)
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes", "on")


def load_config(
    env_file: Optional[Path] = None,
    validate: bool = True,
) -> AgentEnvironment:
    """Load configuration from environment variables.

    Looks for configuration in:
    1. Environment variables (highest priority)
    2. .env file in specified path
    3. .env file in current directory
    4. .env file in project root
    5. Default values (lowest priority)

    Environment Variables:
        AGENT_PROVIDER: Provider name (claude_sdk, anthropic, mock)
        ANTHROPIC_API_KEY: API key for Anthropic
        CLAUDE_MODEL: Model identifier
        AGENT_MAX_ITERATIONS: Maximum tool-calling rounds
        AGENT_TIMEOUT: Timeout in seconds
        AGENT_MAX_TOKENS: Maximum response tokens
        AGENT_TEMPERATURE: Sampling temperature
        WORKSPACE_DIR: Working directory for file operations
        LOG_LEVEL: Logging level
        LAMMPS_BINARY: Path to LAMMPS binary
        QE_BINARY: Path to QE binary

    Args:
        env_file: Optional path to .env file
        validate: Whether to validate the configuration

    Returns:
        AgentEnvironment with loaded configuration

    Raises:
        ConfigurationError: If validation fails and validate=True
    """
    # Load .env file if available
    if HAS_DOTENV:
        if env_file and env_file.exists():
            load_dotenv(env_file)
            logger.debug(f"Loaded environment from {env_file}")
        else:
            # Try common locations
            for path in [Path.cwd() / ".env", Path(__file__).parent.parent.parent / ".env"]:
                if path.exists():
                    load_dotenv(path)
                    logger.debug(f"Loaded environment from {path}")
                    break

    # Build configuration from environment
    working_dir = os.environ.get("WORKSPACE_DIR")
    if working_dir:
        working_directory = Path(working_dir).resolve()
    else:
        working_directory = Path.cwd()

    config = AgentEnvironment(
        provider=os.environ.get("AGENT_PROVIDER", "claude_sdk"),
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
        max_iterations=_get_env_int("AGENT_MAX_ITERATIONS", 10),
        timeout=_get_env_int("AGENT_TIMEOUT", 120),
        max_tokens=_get_env_int("AGENT_MAX_TOKENS", 4096),
        temperature=_get_env_float("AGENT_TEMPERATURE", 0.0),
        working_directory=working_directory,
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        lammps_binary=os.environ.get("LAMMPS_BINARY"),
        qe_binary=os.environ.get("QE_BINARY"),
    )

    if validate:
        config.validate()

    logger.debug(f"Loaded config: provider={config.provider}, model={config.model}")
    return config


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "AgentEnvironment",
    "ConfigurationError",
    "load_config",
]
