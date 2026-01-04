"""
Factory for Agent Providers.

This module provides a factory pattern for creating AgentProvider instances
based on configuration. It abstracts away the specific adapter being used.

Components:
    - get_provider: Factory function to get an AgentProvider
    - list_providers: Get available provider names
    - register_provider: Register a custom provider
"""

import logging
from typing import Callable, Dict, List, Optional, Type

from .config import AgentEnvironment, ConfigurationError, load_config
from .interface import AgentProvider


logger = logging.getLogger(__name__)


# =============================================================================
# Provider Registry
# =============================================================================

# Maps provider names to their adapter classes
_provider_registry: Dict[str, Type[AgentProvider]] = {}


def register_provider(name: str, provider_class: Type[AgentProvider]) -> None:
    """Register a provider class.

    Args:
        name: Provider name (e.g., "claude_sdk", "anthropic", "mock")
        provider_class: The AgentProvider subclass
    """
    _provider_registry[name] = provider_class
    logger.debug(f"Registered provider: {name}")


def list_providers() -> List[str]:
    """Get list of registered provider names.

    Returns:
        List of provider names
    """
    return list(_provider_registry.keys())


def _ensure_providers_registered() -> None:
    """Ensure built-in providers are registered.

    This is called lazily to avoid import issues.
    """
    if _provider_registry:
        return  # Already registered

    # Import and register built-in adapters
    try:
        from .adapters.claude_sdk import ClaudeSDKAdapter
        register_provider("claude_sdk", ClaudeSDKAdapter)
    except ImportError as e:
        logger.debug(f"Claude SDK adapter not available: {e}")

    try:
        from .adapters.anthropic_raw import AnthropicAdapter
        register_provider("anthropic", AnthropicAdapter)
    except ImportError as e:
        logger.debug(f"Anthropic adapter not available: {e}")

    try:
        from .adapters.mock import MockAdapter
        register_provider("mock", MockAdapter)
    except ImportError as e:
        logger.debug(f"Mock adapter not available: {e}")


# =============================================================================
# Factory Function
# =============================================================================


def get_provider(
    config: Optional[AgentEnvironment] = None,
    provider_name: Optional[str] = None,
) -> AgentProvider:
    """Get an AgentProvider based on configuration.

    If no config is provided, loads from environment.
    If provider_name is provided, it overrides config.provider.

    Args:
        config: Optional AgentEnvironment. If None, loads from environment.
        provider_name: Optional provider name override.

    Returns:
        AgentProvider instance ready for use.

    Raises:
        ConfigurationError: If provider is not available or configuration invalid.
    """
    # Load config if not provided
    if config is None:
        config = load_config()

    # Override provider if specified
    name = provider_name or config.provider

    # Ensure providers are registered
    _ensure_providers_registered()

    # Check if provider is registered
    if name not in _provider_registry:
        available = list_providers()
        raise ConfigurationError(
            f"Unknown provider '{name}'. Available: {available}",
            config_key="AGENT_PROVIDER"
        )

    # Get provider class
    provider_class = _provider_registry[name]

    # Create and return instance
    logger.info(f"Creating provider: {name}")
    provider = provider_class(config.to_agent_config())

    # Check availability
    if not provider.is_available():
        raise ConfigurationError(
            f"Provider '{name}' is not available. Check dependencies and API key.",
            config_key="AGENT_PROVIDER"
        )

    return provider


def get_provider_class(name: str) -> Optional[Type[AgentProvider]]:
    """Get a provider class by name without instantiating.

    Args:
        name: Provider name

    Returns:
        Provider class or None if not found
    """
    _ensure_providers_registered()
    return _provider_registry.get(name)


# =============================================================================
# Convenience Functions
# =============================================================================


def is_provider_available(name: str) -> bool:
    """Check if a provider is available.

    Args:
        name: Provider name to check

    Returns:
        True if provider is available
    """
    _ensure_providers_registered()

    if name not in _provider_registry:
        return False

    # Try to create a test instance
    try:
        config = load_config(validate=False)
        config.provider = name
        provider_class = _provider_registry[name]
        provider = provider_class(config.to_agent_config())
        return provider.is_available()
    except Exception:
        return False


def get_best_available_provider() -> Optional[AgentProvider]:
    """Get the best available provider.

    Tries providers in order of preference:
    1. claude_sdk (if available)
    2. anthropic (if available)
    3. mock (always available)

    Returns:
        AgentProvider instance or None if none available
    """
    _ensure_providers_registered()

    preference_order = ["claude_sdk", "anthropic", "mock"]

    for name in preference_order:
        if name in _provider_registry:
            try:
                return get_provider(provider_name=name)
            except ConfigurationError:
                continue

    return None


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "get_provider",
    "get_provider_class",
    "list_providers",
    "register_provider",
    "is_provider_available",
    "get_best_available_provider",
]
