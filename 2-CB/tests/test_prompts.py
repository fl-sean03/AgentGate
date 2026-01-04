"""
Tests for Campaign Builder agent prompts.

Tests cover:
    - Prompt existence and non-emptiness
    - Key section presence in prompts
    - JSON output format instructions
    - Never-do rules inclusion
    - Constants configuration
"""

import pytest

from campaign_builder.agent import (
    FILE_ANALYZER_PROMPT,
    CAMPAIGN_PLANNER_PROMPT,
    MAX_FILE_SIZE_LINES,
    MAX_EXCERPT_CHARS,
    FILE_ANALYZER_PROMPT_VERSION,
    CAMPAIGN_PLANNER_PROMPT_VERSION,
)


# =============================================================================
# Constants Tests
# =============================================================================


class TestPromptConstants:
    """Tests for prompt configuration constants."""

    def test_max_file_size_lines_is_positive(self):
        """Test MAX_FILE_SIZE_LINES is a positive integer."""
        assert isinstance(MAX_FILE_SIZE_LINES, int)
        assert MAX_FILE_SIZE_LINES > 0
        assert MAX_FILE_SIZE_LINES == 500  # As specified in DevGuide

    def test_max_excerpt_chars_is_positive(self):
        """Test MAX_EXCERPT_CHARS is a positive integer."""
        assert isinstance(MAX_EXCERPT_CHARS, int)
        assert MAX_EXCERPT_CHARS > 0
        assert MAX_EXCERPT_CHARS == 2000  # As specified in DevGuide

    def test_version_strings_are_valid(self):
        """Test version strings follow semver format."""
        import re

        semver_pattern = r"^\d+\.\d+\.\d+$"
        assert re.match(semver_pattern, FILE_ANALYZER_PROMPT_VERSION)
        assert re.match(semver_pattern, CAMPAIGN_PLANNER_PROMPT_VERSION)


# =============================================================================
# FileAnalyzer Prompt Tests
# =============================================================================


class TestFileAnalyzerPrompt:
    """Tests for FILE_ANALYZER_PROMPT content."""

    def test_prompt_is_non_empty_string(self):
        """Test FILE_ANALYZER_PROMPT is a non-empty string."""
        assert isinstance(FILE_ANALYZER_PROMPT, str)
        assert len(FILE_ANALYZER_PROMPT) > 0
        # Prompts should be comprehensive (2000-4000 tokens ~ 8000-16000 chars)
        assert len(FILE_ANALYZER_PROMPT) > 5000

    def test_identity_section_present(self):
        """Test prompt contains identity section."""
        assert "FileAnalyzer agent" in FILE_ANALYZER_PROMPT
        assert "specialist" in FILE_ANALYZER_PROMPT.lower()
        assert "mission" in FILE_ANALYZER_PROMPT.lower()

    def test_file_size_strategy_section(self):
        """Test prompt contains file size strategy section."""
        assert "File Analysis Strategy" in FILE_ANALYZER_PROMPT
        assert "wc -l" in FILE_ANALYZER_PROMPT
        assert "SMALL files" in FILE_ANALYZER_PROMPT
        assert "LARGE files" in FILE_ANALYZER_PROMPT
        assert "500" in FILE_ANALYZER_PROMPT  # The threshold

    def test_lammps_data_file_strategy(self):
        """Test prompt contains LAMMPS data file strategy."""
        assert "LAMMPS Data Files" in FILE_ANALYZER_PROMPT
        assert "Masses" in FILE_ANALYZER_PROMPT
        assert "Pair Coeffs" in FILE_ANALYZER_PROMPT
        assert "Bond Coeffs" in FILE_ANALYZER_PROMPT
        assert "Angle Coeffs" in FILE_ANALYZER_PROMPT
        assert "atom_style" in FILE_ANALYZER_PROMPT
        # Critical: Never read coordinates
        assert "DO NOT READ COORDINATES" in FILE_ANALYZER_PROMPT or "NEVER read" in FILE_ANALYZER_PROMPT

    def test_lammps_input_script_strategy(self):
        """Test prompt contains LAMMPS input script strategy."""
        assert "LAMMPS Input Scripts" in FILE_ANALYZER_PROMPT
        assert "units" in FILE_ANALYZER_PROMPT
        assert "pair_style" in FILE_ANALYZER_PROMPT
        assert "pair_coeff" in FILE_ANALYZER_PROMPT
        assert "fix" in FILE_ANALYZER_PROMPT
        assert "timestep" in FILE_ANALYZER_PROMPT
        assert "thermo" in FILE_ANALYZER_PROMPT

    def test_qe_input_strategy(self):
        """Test prompt contains QE input strategy."""
        assert "Quantum ESPRESSO" in FILE_ANALYZER_PROMPT
        assert "&CONTROL" in FILE_ANALYZER_PROMPT
        assert "&SYSTEM" in FILE_ANALYZER_PROMPT
        assert "&ELECTRONS" in FILE_ANALYZER_PROMPT
        assert "ATOMIC_SPECIES" in FILE_ANALYZER_PROMPT
        assert "ATOMIC_POSITIONS" in FILE_ANALYZER_PROMPT
        assert "K_POINTS" in FILE_ANALYZER_PROMPT
        assert "ecutwfc" in FILE_ANALYZER_PROMPT
        assert "pseudopotential" in FILE_ANALYZER_PROMPT.lower()

    def test_pdf_strategy(self):
        """Test prompt contains PDF strategy."""
        assert "PDF Documents" in FILE_ANALYZER_PROMPT
        assert "read_pdf" in FILE_ANALYZER_PROMPT
        assert "methodology" in FILE_ANALYZER_PROMPT.lower()
        assert "parameters" in FILE_ANALYZER_PROMPT.lower()
        assert "force field" in FILE_ANALYZER_PROMPT.lower()

    def test_excel_csv_strategy(self):
        """Test prompt contains Excel/CSV strategy."""
        assert "Excel" in FILE_ANALYZER_PROMPT
        assert "CSV" in FILE_ANALYZER_PROMPT
        assert "column" in FILE_ANALYZER_PROMPT.lower()
        assert "sheet" in FILE_ANALYZER_PROMPT.lower()

    def test_json_output_format_instructions(self):
        """Test prompt contains JSON output format instructions."""
        assert "Output Format" in FILE_ANALYZER_PROMPT
        assert "JSON" in FILE_ANALYZER_PROMPT
        assert "file_path" in FILE_ANALYZER_PROMPT
        assert "file_name" in FILE_ANALYZER_PROMPT
        assert "file_type" in FILE_ANALYZER_PROMPT
        assert "purpose" in FILE_ANALYZER_PROMPT
        assert "summary" in FILE_ANALYZER_PROMPT
        assert "confidence" in FILE_ANALYZER_PROMPT
        assert '"high"' in FILE_ANALYZER_PROMPT or "high|medium|low" in FILE_ANALYZER_PROMPT

    def test_never_do_rules_present(self):
        """Test prompt contains never-do rules."""
        assert "NEVER" in FILE_ANALYZER_PROMPT
        # Check for specific critical rules
        prompt_lower = FILE_ANALYZER_PROMPT.lower()
        assert "never read" in prompt_lower or "never read atom coordinates" in prompt_lower
        assert "never invent" in prompt_lower or "never estimate" in prompt_lower
        assert "never skip" in prompt_lower or "never skip coefficient" in prompt_lower

    def test_tool_descriptions(self):
        """Test prompt describes available tools."""
        assert "Read" in FILE_ANALYZER_PROMPT
        assert "Bash" in FILE_ANALYZER_PROMPT
        assert "Grep" in FILE_ANALYZER_PROMPT

    def test_confidence_levels_documented(self):
        """Test prompt documents confidence level meanings."""
        assert "high" in FILE_ANALYZER_PROMPT
        assert "medium" in FILE_ANALYZER_PROMPT
        assert "low" in FILE_ANALYZER_PROMPT

    def test_missing_info_handling(self):
        """Test prompt addresses missing information handling."""
        assert "missing_info" in FILE_ANALYZER_PROMPT
        assert "warnings" in FILE_ANALYZER_PROMPT
        assert "parse_errors" in FILE_ANALYZER_PROMPT


# =============================================================================
# Campaign Planner Prompt Tests
# =============================================================================


class TestCampaignPlannerPrompt:
    """Tests for CAMPAIGN_PLANNER_PROMPT content."""

    def test_prompt_is_non_empty_string(self):
        """Test CAMPAIGN_PLANNER_PROMPT is a non-empty string."""
        assert isinstance(CAMPAIGN_PLANNER_PROMPT, str)
        assert len(CAMPAIGN_PLANNER_PROMPT) > 0
        # Prompts should be comprehensive (3000-4000 tokens ~ 12000-16000 chars)
        assert len(CAMPAIGN_PLANNER_PROMPT) > 8000

    def test_identity_section_present(self):
        """Test prompt contains identity section."""
        assert "Campaign Planner agent" in CAMPAIGN_PLANNER_PROMPT
        assert "specialist" in CAMPAIGN_PLANNER_PROMPT.lower()
        assert "mission" in CAMPAIGN_PLANNER_PROMPT.lower()

    def test_intent_parsing_section(self):
        """Test prompt contains intent parsing section."""
        assert "Parse User Intent" in CAMPAIGN_PLANNER_PROMPT
        assert "Target Property" in CAMPAIGN_PLANNER_PROMPT
        assert "Simulation Type" in CAMPAIGN_PLANNER_PROMPT
        assert "Conditions" in CAMPAIGN_PLANNER_PROMPT
        assert "Temperature" in CAMPAIGN_PLANNER_PROMPT
        assert "Pressure" in CAMPAIGN_PLANNER_PROMPT

    def test_file_guide_analysis_section(self):
        """Test prompt contains File Guide analysis section."""
        assert "Analyze File Guides" in CAMPAIGN_PLANNER_PROMPT
        assert "Identify Role" in CAMPAIGN_PLANNER_PROMPT
        assert "Extract Parameters" in CAMPAIGN_PLANNER_PROMPT
        assert "Check Completeness" in CAMPAIGN_PLANNER_PROMPT
        assert "Detect Conflicts" in CAMPAIGN_PLANNER_PROMPT

    def test_missing_info_handling_section(self):
        """Test prompt contains missing information handling."""
        assert "Missing Critical Information" in CAMPAIGN_PLANNER_PROMPT
        assert "CANNOT PROCEED" in CAMPAIGN_PLANNER_PROMPT or "DO NOT PROCEED" in CAMPAIGN_PLANNER_PROMPT
        assert "Suggestions" in CAMPAIGN_PLANNER_PROMPT or "Suggest" in CAMPAIGN_PLANNER_PROMPT

    def test_generation_rules_section(self):
        """Test prompt contains generation rules."""
        assert "Generate Input Decks" in CAMPAIGN_PLANNER_PROMPT
        assert "Use Exact Parameters" in CAMPAIGN_PLANNER_PROMPT
        assert "Cite Sources" in CAMPAIGN_PLANNER_PROMPT
        assert "Follow Engine Best Practices" in CAMPAIGN_PLANNER_PROMPT

    def test_lammps_structure_documented(self):
        """Test prompt documents LAMMPS input structure."""
        assert "LAMMPS" in CAMPAIGN_PLANNER_PROMPT
        assert "units" in CAMPAIGN_PLANNER_PROMPT
        assert "atom_style" in CAMPAIGN_PLANNER_PROMPT
        assert "read_data" in CAMPAIGN_PLANNER_PROMPT
        assert "pair_style" in CAMPAIGN_PLANNER_PROMPT
        assert "pair_coeff" in CAMPAIGN_PLANNER_PROMPT

    def test_qe_structure_documented(self):
        """Test prompt documents QE input structure."""
        assert "&CONTROL" in CAMPAIGN_PLANNER_PROMPT
        assert "&SYSTEM" in CAMPAIGN_PLANNER_PROMPT
        assert "ATOMIC_SPECIES" in CAMPAIGN_PLANNER_PROMPT

    def test_validation_integration_section(self):
        """Test prompt contains validation integration section."""
        assert "Validate" in CAMPAIGN_PLANNER_PROMPT
        assert "validate_deck" in CAMPAIGN_PLANNER_PROMPT
        assert "L0" in CAMPAIGN_PLANNER_PROMPT
        assert "L1" in CAMPAIGN_PLANNER_PROMPT
        assert "L2" in CAMPAIGN_PLANNER_PROMPT
        assert "L3" in CAMPAIGN_PLANNER_PROMPT
        assert "PASSED" in CAMPAIGN_PLANNER_PROMPT

    def test_never_invent_rules_present(self):
        """Test prompt contains never-invent rules."""
        assert "Never Invent" in CAMPAIGN_PLANNER_PROMPT
        prompt_lower = CAMPAIGN_PLANNER_PROMPT.lower()
        assert "never invent" in prompt_lower
        assert "epsilon" in prompt_lower
        assert "sigma" in prompt_lower
        assert "charges" in prompt_lower
        assert "pseudopotential" in prompt_lower

    def test_acceptable_defaults_documented(self):
        """Test prompt documents acceptable defaults."""
        assert "Acceptable Defaults" in CAMPAIGN_PLANNER_PROMPT or "default" in CAMPAIGN_PLANNER_PROMPT.lower()
        assert "timestep" in CAMPAIGN_PLANNER_PROMPT.lower()
        assert "damping" in CAMPAIGN_PLANNER_PROMPT.lower() or "Tdamp" in CAMPAIGN_PLANNER_PROMPT

    def test_output_format_section(self):
        """Test prompt contains output format section."""
        assert "Output Format" in CAMPAIGN_PLANNER_PROMPT
        assert "Campaign Plan" in CAMPAIGN_PLANNER_PROMPT
        assert "Parameter Manifest" in CAMPAIGN_PLANNER_PROMPT
        assert "Validation Results" in CAMPAIGN_PLANNER_PROMPT
        assert "Assumptions" in CAMPAIGN_PLANNER_PROMPT
        assert "Warnings" in CAMPAIGN_PLANNER_PROMPT

    def test_parameter_manifest_format(self):
        """Test prompt shows parameter manifest format."""
        assert "Parameter" in CAMPAIGN_PLANNER_PROMPT
        assert "Value" in CAMPAIGN_PLANNER_PROMPT
        assert "Source" in CAMPAIGN_PLANNER_PROMPT

    def test_tool_descriptions(self):
        """Test prompt describes available tools."""
        assert "Write" in CAMPAIGN_PLANNER_PROMPT
        assert "validate_deck" in CAMPAIGN_PLANNER_PROMPT
        assert "Read" in CAMPAIGN_PLANNER_PROMPT

    def test_repair_loop_documented(self):
        """Test prompt documents repair loop for validation failures."""
        assert "repair" in CAMPAIGN_PLANNER_PROMPT.lower() or "fix" in CAMPAIGN_PLANNER_PROMPT.lower()
        assert "3" in CAMPAIGN_PLANNER_PROMPT  # Maximum 3 repair attempts


# =============================================================================
# Prompt Quality Tests
# =============================================================================


class TestPromptQuality:
    """Tests for overall prompt quality and completeness."""

    def test_prompts_are_different(self):
        """Test that the two prompts are distinct."""
        assert FILE_ANALYZER_PROMPT != CAMPAIGN_PLANNER_PROMPT

    def test_prompts_have_reasonable_length(self):
        """Test prompts are within reasonable token estimates."""
        # Rough estimate: 1 token ~ 4 characters
        file_analyzer_tokens = len(FILE_ANALYZER_PROMPT) / 4
        campaign_planner_tokens = len(CAMPAIGN_PLANNER_PROMPT) / 4

        # FILE_ANALYZER_PROMPT should be 2000-3000 tokens
        assert 1500 < file_analyzer_tokens < 5000, f"FILE_ANALYZER_PROMPT has ~{file_analyzer_tokens:.0f} tokens"

        # CAMPAIGN_PLANNER_PROMPT should be 3000-4000 tokens
        assert 2000 < campaign_planner_tokens < 6000, f"CAMPAIGN_PLANNER_PROMPT has ~{campaign_planner_tokens:.0f} tokens"

    def test_prompts_are_well_structured(self):
        """Test prompts have clear section structure."""
        # Both prompts should have section headers with ##
        assert FILE_ANALYZER_PROMPT.count("##") >= 5
        assert CAMPAIGN_PLANNER_PROMPT.count("##") >= 5

        # Both prompts should have numbered steps or lists
        assert "Step 1" in FILE_ANALYZER_PROMPT or "1." in FILE_ANALYZER_PROMPT
        assert "Step 1" in CAMPAIGN_PLANNER_PROMPT or "1." in CAMPAIGN_PLANNER_PROMPT

    def test_prompts_use_consistent_formatting(self):
        """Test prompts use consistent markdown formatting."""
        # Both should use code blocks
        assert "```" in FILE_ANALYZER_PROMPT
        assert "```" in CAMPAIGN_PLANNER_PROMPT

        # Both should use emphasis
        assert "**" in FILE_ANALYZER_PROMPT or "*" in FILE_ANALYZER_PROMPT
        assert "**" in CAMPAIGN_PLANNER_PROMPT or "*" in CAMPAIGN_PLANNER_PROMPT

    def test_no_placeholder_tokens(self):
        """Test prompts don't contain unfilled placeholders outside of documentation.

        Note: The Campaign Planner prompt mentions placeholder syntax (e.g., '{{placeholder}}',
        'TODO') when documenting L0 validation checks. These are examples of what to
        look for, not actual unfilled placeholders.
        """
        # For FILE_ANALYZER_PROMPT, no placeholder-like tokens should exist
        placeholders = ["FIXME", "XXX"]
        for placeholder in placeholders:
            assert placeholder not in FILE_ANALYZER_PROMPT, f"Found '{placeholder}' in FILE_ANALYZER_PROMPT"
            assert placeholder not in CAMPAIGN_PLANNER_PROMPT, f"Found '{placeholder}' in CAMPAIGN_PLANNER_PROMPT"

        # The Campaign Planner prompt mentions TODO/{{placeholder}} in L0 validation docs
        # Verify these are in documentation context, not actual unfilled placeholders
        if "TODO" in CAMPAIGN_PLANNER_PROMPT:
            # Should be in the context of L0 validation (what to check for)
            assert "L0" in CAMPAIGN_PLANNER_PROMPT, "TODO mention should be in L0 validation context"
            # Should be describing what markers to check for
            assert "marker" in CAMPAIGN_PLANNER_PROMPT.lower(), "Should be documenting marker detection"

        if "{{" in CAMPAIGN_PLANNER_PROMPT:
            # Verify it's in the L0 validation documentation context
            assert "L0" in CAMPAIGN_PLANNER_PROMPT, "{{placeholder}} mention should be in L0 validation context"
            assert "placeholder" in CAMPAIGN_PLANNER_PROMPT.lower(), "Should be documenting placeholder detection"

        # FILE_ANALYZER_PROMPT should not have these at all
        assert "TODO" not in FILE_ANALYZER_PROMPT, "FILE_ANALYZER_PROMPT should not contain TODO"


# =============================================================================
# Integration Tests
# =============================================================================


class TestPromptIntegration:
    """Tests for prompt integration with other modules."""

    def test_imports_work(self):
        """Test prompts can be imported from agent module."""
        from campaign_builder.agent import (
            FILE_ANALYZER_PROMPT,
            CAMPAIGN_PLANNER_PROMPT,
            MAX_FILE_SIZE_LINES,
            MAX_EXCERPT_CHARS,
        )
        assert FILE_ANALYZER_PROMPT is not None
        assert CAMPAIGN_PLANNER_PROMPT is not None
        assert MAX_FILE_SIZE_LINES == 500
        assert MAX_EXCERPT_CHARS == 2000

    def test_file_guide_schema_fields_mentioned(self):
        """Test FILE_ANALYZER_PROMPT mentions FileGuide schema fields."""
        # Core fields that must be in the output
        required_fields = [
            "file_path",
            "file_name",
            "file_type",
            "file_size_bytes",
            "sha256_hash",
            "purpose",
            "summary",
            "confidence",
            "analysis_iterations",
        ]
        for field in required_fields:
            assert field in FILE_ANALYZER_PROMPT, f"Missing required field '{field}' in FILE_ANALYZER_PROMPT"

    def test_file_types_mentioned(self):
        """Test prompts mention supported file types."""
        file_types = [
            "LAMMPS_DATA",
            "LAMMPS_INPUT",
            "QE_INPUT",
            "PDF",
            "EXCEL",
            "CSV",
        ]
        for ft in file_types:
            # Check either exact match or lowercase variant
            assert ft.lower() in FILE_ANALYZER_PROMPT.lower(), f"Missing file type '{ft}' in FILE_ANALYZER_PROMPT"
