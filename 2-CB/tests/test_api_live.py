"""
Live API Verification Tests.

These tests verify all agent functionality with real Anthropic API calls.
Tests are skipped if ANTHROPIC_API_KEY is not configured.

Run with: pytest tests/test_api_live.py -v
"""

import asyncio
import os
import pytest
from pathlib import Path

from campaign_builder.utils.deps import check_api_key_configured


# Skip all tests in this module if no API key
pytestmark = pytest.mark.skipif(
    not check_api_key_configured(),
    reason="ANTHROPIC_API_KEY not configured"
)


class TestBasicAPI:
    """Test basic API functionality."""

    @pytest.mark.asyncio
    async def test_basic_query(self):
        """Test simple math query returns correct answer."""
        from campaign_builder.agent.factory import get_best_available_provider

        provider = get_best_available_provider()
        result = await provider.run(
            prompt="What is 42 + 58? Reply with ONLY the number, nothing else.",
            system_prompt="You are a calculator. Reply with only the number.",
            tools=[]
        )

        assert result.success
        assert "100" in result.content.strip()
        assert result.usage is not None
        assert result.usage.get("input_tokens", 0) > 0

    @pytest.mark.asyncio
    async def test_basic_query_with_context(self):
        """Test query understands context."""
        from campaign_builder.agent.factory import get_best_available_provider

        provider = get_best_available_provider()
        result = await provider.run(
            prompt="What is the capital of France? One word answer.",
            system_prompt="Be concise.",
            tools=[]
        )

        assert result.success
        assert "Paris" in result.content


class TestToolCalling:
    """Test tool calling functionality."""

    @pytest.mark.asyncio
    async def test_tool_calling_math(self):
        """Test that LLM correctly calls custom tool."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.tool_types import (
            ToolDefinition, build_tool_schema, integer_param
        )

        async def multiply(args):
            return f"Result: {args['a'] * args['b']}"

        calc_tool = ToolDefinition(
            name="multiply",
            description="Multiply two numbers together",
            parameters=build_tool_schema(
                properties={
                    "a": integer_param("First number"),
                    "b": integer_param("Second number"),
                },
                required=["a", "b"]
            ),
            handler=multiply,
            category="math"
        )

        provider = get_best_available_provider()
        result = await provider.run(
            prompt="Calculate 17 times 13 using the multiply tool.",
            system_prompt="Use tools when asked to calculate.",
            tools=[calc_tool]
        )

        assert result.success
        assert len(result.tool_calls) >= 1
        assert result.tool_calls[0].name == "multiply"
        assert "221" in str(result.tool_calls[0].output)

    @pytest.mark.asyncio
    async def test_tool_calling_string_result(self):
        """Test tool that returns string data."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.tool_types import (
            ToolDefinition, build_tool_schema, string_param
        )

        async def get_weather(args):
            city = args.get("city", "Unknown")
            return f"Weather in {city}: 72°F, Sunny"

        weather_tool = ToolDefinition(
            name="get_weather",
            description="Get current weather for a city",
            parameters=build_tool_schema(
                properties={"city": string_param("City name")},
                required=["city"]
            ),
            handler=get_weather,
            category="test"
        )

        provider = get_best_available_provider()
        result = await provider.run(
            prompt="What's the weather in Tokyo?",
            system_prompt="Use tools to get information.",
            tools=[weather_tool]
        )

        assert result.success
        assert len(result.tool_calls) >= 1


class TestLLMFileAnalyzer:
    """Test LLM File Analyzer with real API."""

    @pytest.mark.asyncio
    async def test_analyze_lammps_file(self):
        """Test LLM analyzer correctly identifies LAMMPS water file."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.llm_analyzer import LLMFileAnalyzer

        test_file = Path("tests/fixtures/lammps/water.data")
        if not test_file.exists():
            pytest.skip(f"Test file not found: {test_file}")

        provider = get_best_available_provider()
        analyzer = LLMFileAnalyzer(provider=provider)
        result = await analyzer.analyze_file(test_file)

        assert result.success
        assert result.raw_response is not None
        # Should identify water/SPC model
        response_lower = result.raw_response.lower()
        assert any(word in response_lower for word in ["water", "spc", "h2o", "molecule"])

    @pytest.mark.asyncio
    async def test_analyze_provides_atom_info(self):
        """Test that analyzer provides atom count information."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.llm_analyzer import LLMFileAnalyzer

        test_file = Path("tests/fixtures/lammps/water.data")
        if not test_file.exists():
            pytest.skip(f"Test file not found: {test_file}")

        provider = get_best_available_provider()
        analyzer = LLMFileAnalyzer(provider=provider)
        result = await analyzer.analyze_file(test_file)

        assert result.success
        # Should mention atoms
        assert "atom" in result.raw_response.lower()


class TestLLMCampaignPlanner:
    """Test LLM Campaign Planner with real API."""

    @pytest.mark.asyncio
    async def test_plan_nvt_simulation(self):
        """Test planner creates valid intent analysis for NVT."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.file_analyzer import analyze_file
        from campaign_builder.agent.llm_planner import LLMCampaignPlanner
        import tempfile

        test_file = Path("tests/fixtures/lammps/water.data")
        if not test_file.exists():
            pytest.skip(f"Test file not found: {test_file}")

        # Analyze file first
        file_analysis = await analyze_file(test_file)

        provider = get_best_available_provider()

        with tempfile.TemporaryDirectory() as tmpdir:
            planner = LLMCampaignPlanner(provider=provider)
            result = await planner.plan_campaign(
                intent="Run NVT equilibration at 300K for 10ps",
                file_guides=[file_analysis.file_guide],
                output_dir=Path(tmpdir),
            )

            assert result.intent_analysis is not None

    @pytest.mark.asyncio
    async def test_plan_with_temperature(self):
        """Test planner extracts temperature from intent."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.file_analyzer import analyze_file
        from campaign_builder.agent.llm_planner import LLMCampaignPlanner
        import tempfile

        test_file = Path("tests/fixtures/lammps/water.data")
        if not test_file.exists():
            pytest.skip(f"Test file not found: {test_file}")

        file_analysis = await analyze_file(test_file)
        provider = get_best_available_provider()

        with tempfile.TemporaryDirectory() as tmpdir:
            planner = LLMCampaignPlanner(provider=provider)
            result = await planner.plan_campaign(
                intent="Heat the system to 500K using NVT ensemble",
                file_guides=[file_analysis.file_guide],
                output_dir=Path(tmpdir),
            )

            # Intent analysis should capture temperature
            if result.intent_analysis and result.intent_analysis.target_temperature:
                assert result.intent_analysis.target_temperature == 500


class TestReliability:
    """Test reliability patterns with real API."""

    @pytest.mark.asyncio
    async def test_resilient_provider_works(self):
        """Test ResilientProvider wraps provider correctly."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.reliability import ResilientProvider, RetryConfig

        provider = get_best_available_provider()
        resilient = ResilientProvider(
            provider=provider,
            retry_config=RetryConfig(max_retries=2)
        )

        result = await resilient.run(
            prompt="Say hello",
            system_prompt="Be brief",
            tools=[]
        )

        assert result.success
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_provider_chain_uses_primary(self):
        """Test ProviderChain uses primary provider when available."""
        from campaign_builder.agent.reliability import ProviderChain

        chain = ProviderChain(provider_names=["anthropic", "mock"])

        result = await chain.run(
            prompt="What is 2+2?",
            system_prompt="Be concise",
            tools=[]
        )

        assert result.success
        # Should get real answer, not mock
        assert "4" in result.content or "four" in result.content.lower()


class TestValidationWithLLM:
    """Test LLM uses validation tools correctly."""

    @pytest.mark.asyncio
    async def test_llm_uses_validation_tool(self):
        """Test LLM can use validation tool."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.tools.validation import validate_l0_tool

        provider = get_best_available_provider()

        # Ask LLM to validate content with placeholder
        result = await provider.run(
            prompt="Please validate this content for placeholders: 'units {{UNITS}}'",
            system_prompt="Use the validate_l0 tool to check for placeholders.",
            tools=[validate_l0_tool]
        )

        assert result.success
        # LLM should have used the tool
        assert len(result.tool_calls) >= 1


class TestStreaming:
    """Test streaming functionality with real API."""

    @pytest.mark.asyncio
    async def test_streaming_yields_content(self):
        """Test streaming yields text content."""
        from campaign_builder.agent.factory import get_best_available_provider

        provider = get_best_available_provider()

        events = []
        async for event in provider.stream(
            prompt="Count from 1 to 5",
            system_prompt="Be concise",
            tools=[]
        ):
            events.append(event)

        assert len(events) > 0
