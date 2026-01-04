"""
Reliability and Fallback Mechanisms for Agent System.

This module provides reliability patterns for the agent abstraction layer:
    - Retry logic with exponential backoff
    - Provider fallback chain
    - Rate limiting
    - Circuit breaker pattern
    - Graceful degradation

Usage:
    from campaign_builder.agent.reliability import (
        RetryConfig,
        retry_with_backoff,
        ProviderChain,
        RateLimiter,
    )

    # Retry with backoff
    result = await retry_with_backoff(
        async_func=lambda: provider.run(prompt, system, tools),
        config=RetryConfig(max_retries=3),
    )

    # Provider fallback chain
    chain = ProviderChain(["anthropic", "claude_sdk", "mock"])
    result = await chain.run(prompt, system_prompt, tools)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, TypeVar

from .interface import AgentProvider, AgentResult, AgentConfig
from .factory import get_provider, list_providers


logger = logging.getLogger(__name__)


# =============================================================================
# Type Variables
# =============================================================================

T = TypeVar("T")


# =============================================================================
# Retry Configuration
# =============================================================================

class RetryStrategy(Enum):
    """Strategy for retry delays."""
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"


@dataclass
class RetryConfig:
    """Configuration for retry behavior.

    Attributes:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        strategy: Retry delay strategy
        jitter: Add random jitter to delays
        retryable_errors: List of error types/messages to retry on
    """

    max_retries: int = 3
    initial_delay: float = 1.0
    max_delay: float = 30.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    jitter: bool = True
    retryable_errors: List[str] = field(default_factory=lambda: [
        "rate_limit",
        "timeout",
        "connection",
        "overloaded",
        "503",
        "529",
    ])

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt number.

        Args:
            attempt: Attempt number (0-based)

        Returns:
            Delay in seconds
        """
        if self.strategy == RetryStrategy.FIXED:
            delay = self.initial_delay
        elif self.strategy == RetryStrategy.LINEAR:
            delay = self.initial_delay * (attempt + 1)
        else:  # EXPONENTIAL
            delay = self.initial_delay * (2 ** attempt)

        # Apply max
        delay = min(delay, self.max_delay)

        # Add jitter
        if self.jitter:
            import random
            jitter_amount = delay * 0.2  # 20% jitter
            delay += random.uniform(-jitter_amount, jitter_amount)

        return max(0, delay)

    def should_retry(self, error: str) -> bool:
        """Check if error is retryable.

        Args:
            error: Error message or type

        Returns:
            True if should retry
        """
        error_lower = error.lower()
        for pattern in self.retryable_errors:
            if pattern.lower() in error_lower:
                return True
        return False


# =============================================================================
# Retry Logic
# =============================================================================

async def retry_with_backoff(
    async_func: Callable[[], Any],
    config: Optional[RetryConfig] = None,
    on_retry: Optional[Callable[[int, Exception], None]] = None,
) -> Any:
    """Execute function with retry and backoff.

    Args:
        async_func: Async function to execute
        config: Retry configuration
        on_retry: Optional callback when retrying (attempt, exception)

    Returns:
        Result from async_func

    Raises:
        Last exception if all retries exhausted
    """
    config = config or RetryConfig()
    last_exception: Optional[Exception] = None

    for attempt in range(config.max_retries + 1):
        try:
            return await async_func()
        except Exception as e:
            last_exception = e
            error_str = str(e)

            # Check if retryable
            if not config.should_retry(error_str):
                logger.debug(f"Non-retryable error: {error_str}")
                raise

            # Check if more retries available
            if attempt >= config.max_retries:
                logger.warning(f"Max retries ({config.max_retries}) exhausted")
                raise

            # Calculate delay
            delay = config.calculate_delay(attempt)
            logger.info(f"Retry {attempt + 1}/{config.max_retries} after {delay:.1f}s: {error_str}")

            # Callback
            if on_retry:
                on_retry(attempt, e)

            # Wait
            await asyncio.sleep(delay)

    # Should not reach here, but just in case
    if last_exception:
        raise last_exception


# =============================================================================
# Provider Fallback Chain
# =============================================================================

@dataclass
class ProviderChain:
    """Chain of providers with automatic fallback.

    If the primary provider fails, the chain tries the next provider.
    Useful for ensuring availability even when preferred provider is down.

    Usage:
        chain = ProviderChain(["anthropic", "claude_sdk", "mock"])
        result = await chain.run(prompt, system_prompt, tools)
    """

    provider_names: List[str]
    config: Optional[AgentConfig] = None
    retry_config: Optional[RetryConfig] = None
    _providers: Dict[str, AgentProvider] = field(default_factory=dict)

    def _get_provider(self, name: str) -> Optional[AgentProvider]:
        """Get or create a provider by name."""
        if name not in self._providers:
            try:
                provider = get_provider(provider_name=name)
                if provider.is_available():
                    self._providers[name] = provider
                else:
                    return None
            except Exception as e:
                logger.debug(f"Provider {name} not available: {e}")
                return None
        return self._providers.get(name)

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[Any],
        **kwargs: Any,
    ) -> AgentResult:
        """Run query with fallback through provider chain.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of tools
            **kwargs: Additional arguments

        Returns:
            AgentResult from first successful provider

        Raises:
            RuntimeError: If all providers fail
        """
        errors = []

        for name in self.provider_names:
            provider = self._get_provider(name)
            if provider is None:
                errors.append(f"{name}: not available")
                continue

            try:
                logger.info(f"Trying provider: {name}")

                # Run with retry
                if self.retry_config:
                    result = await retry_with_backoff(
                        async_func=lambda p=provider: p.run(
                            prompt, system_prompt, tools, **kwargs
                        ),
                        config=self.retry_config,
                    )
                else:
                    result = await provider.run(prompt, system_prompt, tools, **kwargs)

                if result.success:
                    return result
                else:
                    errors.append(f"{name}: {result.error}")

            except Exception as e:
                errors.append(f"{name}: {str(e)}")
                logger.warning(f"Provider {name} failed: {e}")

        # All providers failed
        error_summary = "; ".join(errors)
        return AgentResult(
            success=False,
            content="",
            error=f"All providers failed: {error_summary}",
        )


# =============================================================================
# Rate Limiter
# =============================================================================

@dataclass
class RateLimiter:
    """Simple rate limiter using token bucket algorithm.

    Limits the number of requests per time window.

    Usage:
        limiter = RateLimiter(max_requests=10, window_seconds=60)
        async with limiter:
            result = await provider.run(...)
    """

    max_requests: int = 60
    window_seconds: float = 60.0
    _tokens: float = field(init=False)
    _last_update: float = field(init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def __post_init__(self):
        self._tokens = float(self.max_requests)
        self._last_update = time.time()

    def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = time.time()
        elapsed = now - self._last_update
        self._tokens = min(
            self.max_requests,
            self._tokens + (elapsed * self.max_requests / self.window_seconds)
        )
        self._last_update = now

    async def acquire(self) -> None:
        """Acquire a rate limit token, waiting if necessary."""
        async with self._lock:
            while True:
                self._refill()

                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return

                # Calculate wait time
                wait_time = self.window_seconds / self.max_requests
                logger.debug(f"Rate limited, waiting {wait_time:.1f}s")
                await asyncio.sleep(wait_time)

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


# =============================================================================
# Circuit Breaker
# =============================================================================

class CircuitState(Enum):
    """State of the circuit breaker."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CircuitBreaker:
    """Circuit breaker pattern for provider calls.

    Prevents repeated calls to a failing provider, allowing it to recover.

    Usage:
        breaker = CircuitBreaker(failure_threshold=5)

        @breaker
        async def call_provider():
            return await provider.run(...)
    """

    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 3

    _state: CircuitState = field(default=CircuitState.CLOSED)
    _failure_count: int = field(default=0)
    _last_failure_time: Optional[float] = field(default=None)
    _half_open_calls: int = field(default=0)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._state

    async def _check_state(self) -> bool:
        """Check and update circuit state.

        Returns:
            True if request should proceed
        """
        async with self._lock:
            if self._state == CircuitState.CLOSED:
                return True

            if self._state == CircuitState.OPEN:
                # Check if recovery timeout has passed
                if (
                    self._last_failure_time
                    and time.time() - self._last_failure_time > self.recovery_timeout
                ):
                    self._state = CircuitState.HALF_OPEN
                    self._half_open_calls = 0
                    logger.info("Circuit breaker entering half-open state")
                    return True
                return False

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls < self.half_open_max_calls:
                    self._half_open_calls += 1
                    return True
                return False

            return False

    async def _record_success(self) -> None:
        """Record successful call."""
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                logger.info("Circuit breaker closed (recovered)")
            self._failure_count = 0

    async def _record_failure(self) -> None:
        """Record failed call."""
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                logger.warning("Circuit breaker reopened after half-open failure")
            elif self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    f"Circuit breaker opened after {self.failure_threshold} failures"
                )

    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap function with circuit breaker."""
        async def wrapper(*args, **kwargs):
            if not await self._check_state():
                raise RuntimeError("Circuit breaker is open")

            try:
                result = await func(*args, **kwargs)
                await self._record_success()
                return result
            except Exception as e:
                await self._record_failure()
                raise

        return wrapper


# =============================================================================
# Resilient Provider Wrapper
# =============================================================================

class ResilientProvider:
    """Wrapper that adds reliability features to any provider.

    Combines retry, rate limiting, and circuit breaker patterns.

    Usage:
        base_provider = get_provider()
        resilient = ResilientProvider(
            base_provider,
            retry_config=RetryConfig(max_retries=3),
            rate_limit=60,  # per minute
        )
        result = await resilient.run(prompt, system, tools)
    """

    def __init__(
        self,
        provider: AgentProvider,
        retry_config: Optional[RetryConfig] = None,
        rate_limit: Optional[int] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
    ):
        """Initialize resilient provider.

        Args:
            provider: Base provider to wrap
            retry_config: Retry configuration
            rate_limit: Maximum requests per minute
            circuit_breaker: Circuit breaker configuration
        """
        self.provider = provider
        self.retry_config = retry_config or RetryConfig()
        self.rate_limiter = (
            RateLimiter(max_requests=rate_limit, window_seconds=60.0)
            if rate_limit
            else None
        )
        self.circuit_breaker = circuit_breaker or CircuitBreaker()

    def get_provider_name(self) -> str:
        """Get wrapped provider name."""
        return f"resilient_{self.provider.get_provider_name()}"

    def is_available(self) -> bool:
        """Check if provider is available."""
        return (
            self.provider.is_available()
            and self.circuit_breaker.state != CircuitState.OPEN
        )

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[Any],
        **kwargs: Any,
    ) -> AgentResult:
        """Run with all reliability features.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of tools
            **kwargs: Additional arguments

        Returns:
            AgentResult
        """
        # Check circuit breaker
        if not await self.circuit_breaker._check_state():
            return AgentResult(
                success=False,
                content="",
                error="Circuit breaker is open",
            )

        # Rate limiting
        if self.rate_limiter:
            await self.rate_limiter.acquire()

        async def do_run():
            return await self.provider.run(prompt, system_prompt, tools, **kwargs)

        try:
            # Retry with backoff
            result = await retry_with_backoff(
                async_func=do_run,
                config=self.retry_config,
            )

            if result.success:
                await self.circuit_breaker._record_success()
            else:
                await self.circuit_breaker._record_failure()

            return result

        except Exception as e:
            await self.circuit_breaker._record_failure()
            return AgentResult(
                success=False,
                content="",
                error=str(e),
            )


# =============================================================================
# Convenience Functions
# =============================================================================

def create_resilient_provider(
    provider_name: Optional[str] = None,
    max_retries: int = 3,
    rate_limit: Optional[int] = None,
) -> ResilientProvider:
    """Create a resilient provider with default settings.

    Args:
        provider_name: Provider name (default: best available)
        max_retries: Maximum retry attempts
        rate_limit: Rate limit per minute

    Returns:
        ResilientProvider
    """
    from .factory import get_provider, get_best_available_provider

    if provider_name:
        base = get_provider(provider_name=provider_name)
    else:
        base = get_best_available_provider()
        if base is None:
            raise RuntimeError("No provider available")

    return ResilientProvider(
        provider=base,
        retry_config=RetryConfig(max_retries=max_retries),
        rate_limit=rate_limit,
    )


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    # Configuration
    "RetryStrategy",
    "RetryConfig",
    # Retry
    "retry_with_backoff",
    # Provider chain
    "ProviderChain",
    # Rate limiting
    "RateLimiter",
    # Circuit breaker
    "CircuitState",
    "CircuitBreaker",
    # Resilient provider
    "ResilientProvider",
    "create_resilient_provider",
]
