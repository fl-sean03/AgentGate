"""
Integration tests for the Agent Abstraction Layer.

These tests verify the complete agent system works end-to-end,
including provider selection, tool execution, and LLM integration.
"""

import asyncio
import os
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Import agent components
from campaign_builder.agent.interface import (
    AgentConfig,
    AgentProvider,
    AgentResult,
    ToolCall,
)
from campaign_builder.agent.tool_types import (
    ToolDefinition,
    ToolError,
    build_tool_schema,
    string_param,
)
from campaign_builder.agent.registry import ToolRegistry, default_registry
from campaign_builder.agent.factory import (
    get_best_available_provider,
    list_providers,
    is_provider_available,
)
from campaign_builder.agent.adapters.mock import MockAdapter


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_adapter():
    """Create a mock adapter for testing."""
    return MockAdapter(
        response_map={
            r"count.*atoms": "The file contains 20 atoms",
            r"generate.*lammps": "# LAMMPS script generated",
            r"validate": '{"passed": true}',
        },
        default_response="Mock response",
    )


@pytest.fixture
def sample_tool():
    """Create a sample tool for testing."""
    async def handler(args):
        return f"Result: {args.get('input', 'none')}"

    return ToolDefinition(
        name="sample_tool",
        description="A sample tool for testing",
        parameters=build_tool_schema(
            properties={"input": string_param("Input value")},
            required=["input"],
        ),
        handler=handler,
        category="test",
    )


@pytest.fixture
def test_registry(sample_tool):
    """Create a test registry with sample tool."""
    registry = ToolRegistry()
    registry.register(sample_tool)
    return registry


@pytest.fixture
def lammps_data_file(tmp_path):
    """Create a temporary LAMMPS data file for testing."""
    content = """LAMMPS data file for testing

10 atoms
2 atom types

0.0 10.0 xlo xhi
0.0 10.0 ylo yhi
0.0 10.0 zlo zhi

Masses

1 12.011
2 1.008

Atoms

1 1 1 0.0 5.0 5.0 5.0
2 1 2 0.0 6.0 5.0 5.0
"""
    file_path = tmp_path / "test.data"
    file_path.write_text(content)
    return file_path


# =============================================================================
# Interface Tests
# =============================================================================

class TestAgentInterface:
    """Tests for the AgentProvider interface."""

    def test_agent_config_defaults(self):
        """Test AgentConfig has sensible defaults."""
        config = AgentConfig()
        assert config.max_iterations == 10
        assert config.timeout == 120
        assert config.model == "claude-sonnet-4-20250514"
        assert config.max_tokens == 4096

    def test_agent_config_custom(self):
        """Test AgentConfig with custom values."""
        config = AgentConfig(
            max_iterations=5,
            timeout=60,
            model="claude-opus-4-20250514",
            max_tokens=8192,
            temperature=0.5,
        )
        assert config.max_iterations == 5
        assert config.timeout == 60
        assert config.temperature == 0.5

    def test_tool_call_structure(self):
        """Test ToolCall data structure."""
        tc = ToolCall(
            id="tc_123",
            name="test_tool",
            input={"key": "value"},
            output="result",
            duration_ms=100,
        )
        assert tc.id == "tc_123"
        assert tc.name == "test_tool"
        assert tc.input == {"key": "value"}
        assert tc.output == "result"
        assert tc.duration_ms == 100
        assert tc.error is None

    def test_agent_result_success(self):
        """Test AgentResult for successful execution."""
        result = AgentResult(
            success=True,
            content="Test content",
            tool_calls=[],
            iterations=1,
            duration_ms=500,
        )
        assert result.success is True
        assert result.content == "Test content"
        assert result.error is None

    def test_agent_result_failure(self):
        """Test AgentResult for failed execution."""
        result = AgentResult(
            success=False,
            content="",
            error="API error",
        )
        assert result.success is False
        assert result.error == "API error"


# =============================================================================
# Tool Definition Tests
# =============================================================================

class TestToolDefinition:
    """Tests for ToolDefinition and related types."""

    def test_tool_definition_creation(self, sample_tool):
        """Test creating a tool definition."""
        assert sample_tool.name == "sample_tool"
        assert sample_tool.description == "A sample tool for testing"
        assert sample_tool.category == "test"
        assert callable(sample_tool.handler)

    def test_tool_definition_to_anthropic(self, sample_tool):
        """Test converting tool to Anthropic format."""
        anthropic_format = sample_tool.to_anthropic_format()
        assert anthropic_format["name"] == "sample_tool"
        assert "description" in anthropic_format
        assert "input_schema" in anthropic_format

    @pytest.mark.asyncio
    async def test_tool_handler_execution(self, sample_tool):
        """Test executing a tool handler."""
        result = await sample_tool.handler({"input": "test_value"})
        assert result == "Result: test_value"

    def test_tool_error(self):
        """Test ToolError exception."""
        error = ToolError("Test error", recoverable=True)
        assert error.message == "Test error"
        assert error.recoverable is True


# =============================================================================
# Registry Tests
# =============================================================================

class TestToolRegistry:
    """Tests for ToolRegistry."""

    def test_registry_register_and_get(self, test_registry, sample_tool):
        """Test registering and retrieving tools."""
        tool = test_registry.get("sample_tool")
        assert tool is not None
        assert tool.name == sample_tool.name

    def test_registry_list_tools(self, test_registry):
        """Test listing all tools."""
        names = test_registry.list_names()
        assert "sample_tool" in names

    def test_registry_filter_by_category(self, test_registry):
        """Test filtering tools by category."""
        tools = list(test_registry.filter_by_category("test"))
        assert len(tools) == 1
        assert tools[0].name == "sample_tool"

    def test_registry_unknown_tool(self, test_registry):
        """Test getting unknown tool returns None."""
        tool = test_registry.get("nonexistent")
        assert tool is None

    def test_default_registry_has_tools(self):
        """Test that default registry has utility tools."""
        # This requires the utilities module to be imported
        from campaign_builder.agent.tools import utilities

        names = default_registry.list_names()
        assert "read_file" in names
        assert "write_file" in names
        assert "glob_files" in names


# =============================================================================
# Mock Adapter Tests
# =============================================================================

class TestMockAdapter:
    """Tests for MockAdapter."""

    def test_mock_is_available(self, mock_adapter):
        """Test mock adapter is always available."""
        assert mock_adapter.is_available() is True

    def test_mock_provider_name(self, mock_adapter):
        """Test mock adapter provider name."""
        assert mock_adapter.get_provider_name() == "mock"

    @pytest.mark.asyncio
    async def test_mock_run_pattern_match(self, mock_adapter):
        """Test mock adapter pattern matching."""
        result = await mock_adapter.run(
            prompt="count the atoms in the file",
            system_prompt="Be helpful",
            tools=[],
        )
        assert result.success is True
        assert "20 atoms" in result.content

    @pytest.mark.asyncio
    async def test_mock_run_default_response(self, mock_adapter):
        """Test mock adapter default response."""
        result = await mock_adapter.run(
            prompt="something random",
            system_prompt="Be helpful",
            tools=[],
        )
        assert result.success is True
        assert result.content == "Mock response"

    @pytest.mark.asyncio
    async def test_mock_run_with_tools(self, mock_adapter, sample_tool):
        """Test mock adapter with tool calls."""
        mock_adapter.simulate_tool_calls = [
            {"name": "sample_tool", "input": {"input": "test"}}
        ]

        result = await mock_adapter.run(
            prompt="test",
            system_prompt="",
            tools=[sample_tool],
        )

        assert result.success is True
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].name == "sample_tool"

    def test_mock_interaction_recording(self, mock_adapter):
        """Test mock adapter records interactions."""
        asyncio.run(mock_adapter.run("test prompt", "system", []))

        last = mock_adapter.get_last_interaction()
        assert last is not None
        assert last.prompt == "test prompt"
        assert last.system_prompt == "system"


# =============================================================================
# Factory Tests
# =============================================================================

class TestFactory:
    """Tests for provider factory."""

    def test_list_providers(self):
        """Test listing available providers."""
        # Trigger provider registration first
        get_best_available_provider()
        providers = list_providers()
        assert "mock" in providers

    def test_mock_provider_available(self):
        """Test mock provider is always available."""
        assert is_provider_available("mock") is True

    def test_get_best_available_returns_something(self):
        """Test get_best_available_provider returns a provider."""
        provider = get_best_available_provider()
        # Should at least get mock if nothing else
        assert provider is not None


# =============================================================================
# File Analyzer Integration Tests
# =============================================================================

class TestFileAnalyzerIntegration:
    """Integration tests for FileAnalyzer with agent system."""

    @pytest.mark.asyncio
    async def test_analyze_lammps_data_file(self, lammps_data_file):
        """Test analyzing a LAMMPS data file."""
        from campaign_builder.agent.file_analyzer import analyze_file

        result = await analyze_file(lammps_data_file)

        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.atom_count == 10
        assert result.file_guide.atom_types_count == 2

    @pytest.mark.asyncio
    async def test_analyze_nonexistent_file(self, tmp_path):
        """Test analyzing a non-existent file."""
        from campaign_builder.agent.file_analyzer import analyze_file

        fake_path = tmp_path / "nonexistent.data"
        result = await analyze_file(fake_path)

        assert result.success is False
        assert len(result.errors) > 0


# =============================================================================
# LLM Integration Tests (Mocked)
# =============================================================================

class TestLLMIntegration:
    """Integration tests for LLM components (mocked)."""

    @pytest.mark.asyncio
    async def test_llm_analyzer_with_mock(self, lammps_data_file):
        """Test LLM analyzer with mock provider."""
        from campaign_builder.agent.llm_analyzer import LLMFileAnalyzer

        # Create mock provider
        mock_provider = MockAdapter(
            response_map={
                r".*": "Summary: LAMMPS data file with 10 atoms."
            }
        )

        analyzer = LLMFileAnalyzer(provider=mock_provider)
        result = await analyzer.analyze_file(lammps_data_file)

        assert result.success is True
        assert result.raw_response is not None

    @pytest.mark.asyncio
    async def test_llm_planner_with_mock(self, lammps_data_file):
        """Test LLM planner with mock provider."""
        from campaign_builder.agent.file_analyzer import analyze_file
        from campaign_builder.agent.llm_planner import LLMCampaignPlanner

        # First analyze the file
        analysis = await analyze_file(lammps_data_file)
        assert analysis.success

        # Create mock provider
        mock_provider = MockAdapter(
            response_map={
                r".*intent.*": '{"simulation_type": "nvt", "target_temperature": 300}',
                r".*generate.*": "# LAMMPS input\nunits real\natom_style full",
            },
            default_response='{"simulation_type": "nvt"}'
        )

        planner = LLMCampaignPlanner(provider=mock_provider)
        result = await planner.plan_campaign(
            intent="Run NVT at 300K",
            file_guides=[analysis.file_guide],
            output_dir=lammps_data_file.parent / "output",
        )

        assert result.intent_analysis is not None


# =============================================================================
# Tool Execution Tests
# =============================================================================

class TestToolExecution:
    """Tests for tool execution through adapters."""

    @pytest.mark.asyncio
    async def test_mock_adapter_executes_real_tools(self):
        """Test mock adapter can execute real tool handlers."""
        # Create a tool that modifies state
        called = {"count": 0}

        async def counter_handler(args):
            called["count"] += 1
            return f"Called {called['count']} times"

        counter_tool = ToolDefinition(
            name="counter",
            description="Counts calls",
            parameters=build_tool_schema(properties={}, required=[]),
            handler=counter_handler,
            category="test",
        )

        adapter = MockAdapter(
            auto_execute_tools=True,
            simulate_tool_calls=[{"name": "counter", "input": {}}],
        )

        result = await adapter.run("test", "system", [counter_tool])

        assert called["count"] == 1
        assert "Called 1 times" in result.tool_calls[0].output


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Tests for error handling in agent system."""

    @pytest.mark.asyncio
    async def test_tool_error_is_caught(self):
        """Test that ToolError is properly caught and reported."""
        async def failing_handler(args):
            raise ToolError("Expected failure", recoverable=True)

        failing_tool = ToolDefinition(
            name="failing_tool",
            description="Always fails",
            parameters=build_tool_schema(properties={}, required=[]),
            handler=failing_handler,
            category="test",
        )

        adapter = MockAdapter(
            auto_execute_tools=True,
            simulate_tool_calls=[{"name": "failing_tool", "input": {}}],
        )

        result = await adapter.run("test", "system", [failing_tool])

        # Tool call should contain error in output
        assert "Error" in result.tool_calls[0].output or "Expected failure" in result.tool_calls[0].output

    @pytest.mark.asyncio
    async def test_generic_exception_in_tool(self):
        """Test generic exception in tool is handled."""
        async def bad_handler(args):
            raise ValueError("Unexpected error")

        bad_tool = ToolDefinition(
            name="bad_tool",
            description="Raises exception",
            parameters=build_tool_schema(properties={}, required=[]),
            handler=bad_handler,
            category="test",
        )

        adapter = MockAdapter(
            auto_execute_tools=True,
            simulate_tool_calls=[{"name": "bad_tool", "input": {}}],
        )

        result = await adapter.run("test", "system", [bad_tool])

        # Should still complete, with error in output
        assert result.success is True
        assert "Error" in result.tool_calls[0].output


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
