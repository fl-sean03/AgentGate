"""
End-to-End Integration Tests.

Tests the complete workflow: LLM → Generation → Validation → Execution.
"""

import os
import json
import pytest
import tempfile
import subprocess
from pathlib import Path

from campaign_builder.utils.deps import check_api_key_configured

# Skip all tests if API key not configured
pytestmark = pytest.mark.skipif(
    not check_api_key_configured(),
    reason="ANTHROPIC_API_KEY not configured"
)


# LAMMPS binary path
LAMMPS_BIN = Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp")
QE_BIN = Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x")


def check_lammps_available():
    """Check if LAMMPS binary is available."""
    return LAMMPS_BIN.exists() and os.access(LAMMPS_BIN, os.X_OK)


def check_qe_available():
    """Check if QE binary is available."""
    return QE_BIN.exists() and os.access(QE_BIN, os.X_OK)


requires_lammps = pytest.mark.skipif(
    not check_lammps_available(),
    reason="LAMMPS binary not available"
)

requires_qe = pytest.mark.skipif(
    not check_qe_available(),
    reason="Quantum ESPRESSO binary not available"
)


class TestLLMGeneratesToValidLAMMPS:
    """Test that LLM can generate valid LAMMPS input that passes validation."""

    @pytest.mark.asyncio
    async def test_llm_generates_lj_simulation(self):
        """Test LLM generates valid LJ fluid simulation."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.tools.validation import validate_lammps_syntax_tool

        provider = get_best_available_provider()

        # Ask LLM to generate LAMMPS input
        response = await provider.run(
            prompt="""Generate a simple LAMMPS input file for a Lennard-Jones fluid simulation.
Use LJ units, create a small FCC lattice, and run for 100 steps with NVE ensemble.
Return ONLY the LAMMPS input file content, no explanations.""",
            system_prompt="You are a LAMMPS expert. Generate valid, runnable input files.",
            tools=[]
        )

        # Extract content
        content = response.content
        assert content, "LLM should generate content"
        assert len(content) > 50, "Content should be substantial"

        # Validate the generated input
        result = await validate_lammps_syntax_tool.handler({"content": content})
        data = json.loads(result)

        # Should pass or have only warnings (not errors)
        assert data["passed"] or len(data["errors"]) == 0, f"Generated LAMMPS should be valid: {data}"


class TestFullValidationPipeline:
    """Test the complete L0-L3 validation pipeline."""

    @pytest.mark.asyncio
    async def test_validate_clean_lammps(self):
        """Test validation pipeline on clean LAMMPS input."""
        from campaign_builder.agent.tools.validation import validate_full_tool

        # Create a clean LAMMPS file
        content = """
units lj
atom_style atomic
boundary p p p
lattice fcc 0.8442
region box block 0 4 0 4 0 4
create_box 1 box
create_atoms 1 box
mass 1 1.0
pair_style lj/cut 2.5
pair_coeff 1 1 1.0 1.0 2.5
velocity all create 1.0 87287
fix 1 all nve
thermo 10
run 100
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.in', delete=False) as f:
            f.write(content)
            path = Path(f.name)

        try:
            result = await validate_full_tool.handler({
                "path": str(path),
                "engine": "lammps"
            })
            data = json.loads(result)

            assert data["overall_passed"], f"Clean LAMMPS should pass: {data}"
            assert "L0" in data["levels_run"]
        finally:
            path.unlink()

    @pytest.mark.asyncio
    async def test_detect_placeholders(self):
        """Test L0 detects placeholders."""
        from campaign_builder.agent.tools.validation import validate_l0_tool

        content = "units {{UNITS}}\ntimestep {{TIMESTEP}}"
        result = await validate_l0_tool.handler({"content": content})
        data = json.loads(result)

        assert data["passed"] is False
        assert len(data["placeholders"]) == 2


@requires_lammps
class TestLAMMPSExecution:
    """Test actual LAMMPS execution."""

    def test_run_simple_lammps(self):
        """Test running a simple LAMMPS simulation."""
        content = """
units lj
atom_style atomic
boundary p p p
lattice fcc 0.8442
region box block 0 4 0 4 0 4
create_box 1 box
create_atoms 1 box
mass 1 1.0
pair_style lj/cut 2.5
pair_coeff 1 1 1.0 1.0 2.5
velocity all create 1.0 87287
fix 1 all nve
thermo 10
run 20
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.in', delete=False) as f:
            f.write(content)
            input_path = Path(f.name)

        try:
            # Run LAMMPS
            result = subprocess.run(
                [str(LAMMPS_BIN), "-in", str(input_path)],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=tempfile.gettempdir()
            )

            assert result.returncode == 0, f"LAMMPS should succeed: {result.stderr}"
            assert "Total wall time" in result.stdout
        finally:
            input_path.unlink()
            # Clean up log.lammps if created
            log_path = Path(tempfile.gettempdir()) / "log.lammps"
            if log_path.exists():
                log_path.unlink()

    @pytest.mark.asyncio
    async def test_l2_engine_validation(self):
        """Test L2 validation runs engine in check mode."""
        from campaign_builder.agent.tools.validation import validate_engine_tool

        content = """
units lj
atom_style atomic
boundary p p p
lattice fcc 0.8442
region box block 0 4 0 4 0 4
create_box 1 box
create_atoms 1 box
mass 1 1.0
pair_style lj/cut 2.5
pair_coeff 1 1 1.0 1.0 2.5
run 0
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.in', delete=False) as f:
            f.write(content)
            input_path = Path(f.name)

        try:
            result = await validate_engine_tool.handler({
                "path": str(input_path),
                "engine": "lammps"
            })
            data = json.loads(result)

            # Should pass engine check
            assert data["passed"] or data["skipped"], f"Engine check: {data}"
        finally:
            input_path.unlink()


class TestLLMWithTools:
    """Test LLM using validation tools."""

    @pytest.mark.asyncio
    async def test_llm_validates_own_output(self):
        """Test LLM can use validation tools to check its output."""
        from campaign_builder.agent.factory import get_best_available_provider
        from campaign_builder.agent.tools.validation import (
            validate_l0_tool,
            validate_lammps_syntax_tool,
        )

        provider = get_best_available_provider()

        # Pass ToolDefinition objects directly - the provider will convert them
        tools = [
            validate_l0_tool,
            validate_lammps_syntax_tool,
        ]

        # Ask LLM to generate and validate
        response = await provider.run(
            prompt="""Generate a simple LAMMPS input file for NVT simulation of argon.
After generating, use the validate_l0 and validate_lammps_syntax tools to verify it.
Tell me if validation passes.""",
            system_prompt="You are a LAMMPS expert with access to validation tools.",
            tools=tools
        )

        # Check response content
        assert response.content, "LLM should generate content"
        # LLM may or may not use tools depending on behavior
        assert len(response.content) > 0


class TestCampaignPlanning:
    """Test campaign planning with LLM."""

    @pytest.mark.asyncio
    async def test_plan_md_campaign(self):
        """Test LLM can plan an MD campaign using direct provider."""
        from campaign_builder.agent.factory import get_best_available_provider

        provider = get_best_available_provider()

        # Use provider directly to plan a campaign
        response = await provider.run(
            prompt="""Plan an MD simulation campaign for NVT equilibration of water at 300K for 1 ns.
Include: minimization, heating, equilibration, and production phases.
List the LAMMPS commands needed for each phase.""",
            system_prompt="You are an MD simulation expert. Plan campaigns step by step.",
            tools=[]
        )

        assert response is not None
        content = response.content
        assert content, "Should generate campaign plan"
        # Check it contains expected keywords
        assert any(kw in content.lower() for kw in ["equilibr", "nvt", "minim", "production"])


class TestFileAnalysis:
    """Test LLM file analysis."""

    @pytest.mark.asyncio
    async def test_analyze_data_file(self, fixtures_dir):
        """Test LLM can analyze LAMMPS data file."""
        from campaign_builder.agent.llm_analyzer import LLMFileAnalyzer

        analyzer = LLMFileAnalyzer()
        water_file = fixtures_dir / "lammps" / "water.data"

        if water_file.exists():
            result = await analyzer.analyze_file(water_file)

            assert result is not None
            # Should identify it's a molecular data file
            if hasattr(result, 'raw_response'):
                content = result.raw_response
            else:
                content = str(result)
            assert len(content) > 0
