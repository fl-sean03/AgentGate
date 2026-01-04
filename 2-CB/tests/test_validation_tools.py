"""
Validation Tool Tests.

Tests for the agent validation tool wrappers.
"""

import json
import pytest
from pathlib import Path

from campaign_builder.agent.tools.validation import (
    validate_l0_tool,
    validate_lammps_syntax_tool,
    validate_qe_syntax_tool,
    validate_engine_tool,
    check_physics_tool,
    validate_full_tool,
)


class TestL0Validation:
    """Test L0 placeholder validation tool."""

    @pytest.mark.asyncio
    async def test_detects_handlebars_placeholder(self):
        """Test detection of {{PLACEHOLDER}} pattern."""
        result = await validate_l0_tool.handler({"content": "units {{UNITS}}"})
        data = json.loads(result)

        assert data["passed"] is False
        assert len(data["placeholders"]) == 1
        assert data["placeholders"][0]["pattern"] == "handlebars"
        assert data["placeholders"][0]["match"] == "{{UNITS}}"

    @pytest.mark.asyncio
    async def test_detects_todo_pattern(self):
        """Test detection of TODO pattern."""
        result = await validate_l0_tool.handler({"content": "# TODO: fix this"})
        data = json.loads(result)

        assert data["passed"] is False
        assert len(data["placeholders"]) >= 1

    @pytest.mark.asyncio
    async def test_passes_clean_content(self):
        """Test that clean content passes."""
        result = await validate_l0_tool.handler({"content": "units metal\natom_style atomic"})
        data = json.loads(result)

        assert data["passed"] is True
        assert len(data["placeholders"]) == 0


class TestL1LAMMPSValidation:
    """Test L1 LAMMPS syntax validation tool."""

    @pytest.mark.asyncio
    async def test_valid_lammps_syntax(self):
        """Test valid LAMMPS syntax passes."""
        content = """
units metal
atom_style atomic
lattice fcc 3.52
region box block 0 10 0 10 0 10
create_box 1 box
create_atoms 1 box
mass 1 58.69
pair_style lj/cut 2.5
pair_coeff 1 1 0.01 3.4
run 100
"""
        result = await validate_lammps_syntax_tool.handler({"content": content})
        data = json.loads(result)

        assert data["passed"] is True
        assert len(data["errors"]) == 0

    @pytest.mark.asyncio
    async def test_missing_required_commands(self):
        """Test missing required commands are detected."""
        content = """
units metal
run 100
"""
        result = await validate_lammps_syntax_tool.handler({"content": content})
        data = json.loads(result)

        # Should have errors about missing atom_style and structure
        assert data["passed"] is False or len(data["warnings"]) > 0


class TestL1QEValidation:
    """Test L1 QE syntax validation tool."""

    @pytest.mark.asyncio
    async def test_valid_qe_syntax(self):
        """Test valid QE syntax passes."""
        content = """
&CONTROL
    calculation = 'scf'
    prefix = 'silicon'
/
&SYSTEM
    ibrav = 2
    celldm(1) = 10.2
    nat = 2
    ntyp = 1
    ecutwfc = 30.0
/
&ELECTRONS
/
ATOMIC_SPECIES
Si 28.086 Si.pbe-n-rrkjus_psl.1.0.0.UPF
ATOMIC_POSITIONS crystal
Si 0.00 0.00 0.00
Si 0.25 0.25 0.25
K_POINTS automatic
4 4 4 1 1 1
"""
        result = await validate_qe_syntax_tool.handler({"content": content})
        data = json.loads(result)

        assert data["passed"] is True
        assert len(data["errors"]) == 0

    @pytest.mark.asyncio
    async def test_missing_required_cards(self):
        """Test missing required cards are detected."""
        content = """
&CONTROL
    calculation = 'scf'
/
&SYSTEM
    ibrav = 2
    nat = 2
    ntyp = 1
    ecutwfc = 30.0
/
&ELECTRONS
/
"""
        result = await validate_qe_syntax_tool.handler({"content": content})
        data = json.loads(result)

        assert data["passed"] is False
        assert len(data["errors"]) > 0


class TestL3PhysicsValidation:
    """Test L3 physics validation tool."""

    @pytest.mark.asyncio
    async def test_reasonable_timestep_passes(self):
        """Test reasonable timestep passes physics checks."""
        content = """
units metal
timestep 0.001
"""
        result = await check_physics_tool.handler({
            "content": content,
            "engine": "lammps"
        })
        data = json.loads(result)

        assert data["passed"] is True

    @pytest.mark.asyncio
    async def test_extreme_timestep_warns(self):
        """Test extreme timestep triggers warnings."""
        content = """
units metal
timestep 100.0
"""
        result = await check_physics_tool.handler({
            "content": content,
            "engine": "lammps"
        })
        data = json.loads(result)

        # Should have physics warnings for extreme timestep
        assert data["passed"] is False or len(data["warnings"]) > 0 or len(data["physics_checks"]) > 0


class TestFullValidation:
    """Test full validation pipeline tool."""

    @pytest.mark.asyncio
    async def test_validates_water_data(self, fixtures_dir):
        """Test full validation on water.data fixture."""
        water_file = fixtures_dir / "lammps" / "water.data"

        result = await validate_full_tool.handler({"path": str(water_file)})
        data = json.loads(result)

        assert "overall_passed" in data
        assert "levels_run" in data
        assert "L0" in data["levels_run"]

    @pytest.mark.asyncio
    async def test_validates_with_engine_specified(self, fixtures_dir):
        """Test full validation with explicit engine."""
        water_file = fixtures_dir / "lammps" / "water.data"

        result = await validate_full_tool.handler({
            "path": str(water_file),
            "engine": "lammps"
        })
        data = json.loads(result)

        assert data["engine"] == "lammps"
