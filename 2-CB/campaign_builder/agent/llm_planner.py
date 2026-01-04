"""
LLM-Enhanced Campaign Planner.

This module integrates LLM capabilities into the CampaignPlanner to provide
intelligent simulation planning, input generation, and validation repair.
It uses the agent abstraction layer for provider-agnostic LLM access.

Key Features:
    - Natural language intent understanding
    - Intelligent input file generation
    - Automated validation repair
    - Parameter extraction with source tracking
    - Multi-step campaign planning

The LLM enhancement works alongside deterministic generation,
using LLM for complex reasoning and validation repair.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from ..schemas import (
    CampaignError,
    ErrorCode,
    ErrorSeverity,
    FileGuide,
    FileType,
)
from ..tools.validation import ValidationResult, validate_deck

from .interface import AgentConfig, AgentProvider, AgentResult
from .factory import get_best_available_provider
from .registry import default_registry
from .tool_types import ToolDefinition
from .campaign_planner import (
    GeneratedFile,
    ParameterSource,
    CampaignPlanResult,
    format_file_guides_for_agent,
    _extract_force_field_info,
    is_unfixable_error,
)


logger = logging.getLogger(__name__)


# =============================================================================
# System Prompts
# =============================================================================

CAMPAIGN_PLANNER_SYSTEM_PROMPT = """You are an expert computational scientist specializing in molecular dynamics simulations with LAMMPS and quantum mechanics with Quantum ESPRESSO.

Your role is to help users plan and generate simulation campaigns based on their intent and available data.

CRITICAL RULES:
1. NEVER invent force field parameters - use ONLY values from the provided file guides
2. Always cite sources for parameters (e.g., "from water.data:line 47")
3. If required information is missing, clearly state what's needed
4. Validate all generated files against physics sanity checks
5. Document all assumptions made

When generating LAMMPS input files:
- Use 'real' units for organic/molecular systems (energy in kcal/mol, time in fs)
- Use 'metal' units for inorganic/materials systems (energy in eV, time in ps)
- Set appropriate timesteps (1 fs for real units, 0.001 ps for metal)
- Use appropriate thermostats (Nose-Hoover for equilibration)

When generating QE input files:
- Set ecutwfc based on pseudopotential recommendations
- Use appropriate k-point grids based on system size
- Set smearing for metallic systems"""

REPAIR_SYSTEM_PROMPT = """You are an expert at fixing validation errors in simulation input files.

You will be given:
1. A simulation input file with validation errors
2. The specific errors found
3. Suggestions for repair

Your task is to:
1. Analyze each error
2. Determine the correct fix
3. Apply all fixes to produce a corrected file
4. Explain what you changed

RULES:
- NEVER guess or invent force field parameters
- If a parameter is missing and not in file guides, report it as unfixable
- Maintain file format and structure
- Keep all comments and documentation"""

INTENT_ANALYSIS_PROMPT = """Analyze the following user intent for a simulation campaign.

User Intent: {intent}

Extract and return in JSON format:
1. simulation_type: One of [minimization, nvt, npt, nve, relax, scf, bands]
2. target_temperature: Temperature in Kelvin (if applicable)
3. target_pressure: Pressure in atm (if applicable)
4. run_duration: Duration with units (e.g., "100 ps", "1 ns")
5. engine: Either "lammps" or "qe"
6. steps: Ordered list of simulation steps
7. parameters: Any other extracted parameters
8. ambiguities: List of unclear aspects that need clarification

Be precise and extract only what is explicitly stated or clearly implied."""


# =============================================================================
# Result Types
# =============================================================================

@dataclass
class IntentAnalysis:
    """Structured analysis of user intent."""

    simulation_type: str
    target_temperature: Optional[float] = None
    target_pressure: Optional[float] = None
    run_duration: Optional[str] = None
    engine: str = "lammps"
    steps: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    ambiguities: List[str] = field(default_factory=list)
    raw_response: Optional[str] = None


@dataclass
class RepairResult:
    """Result of attempting to repair validation errors."""

    success: bool
    repaired_content: Optional[str] = None
    changes_made: List[str] = field(default_factory=list)
    remaining_errors: List[str] = field(default_factory=list)
    unfixable_errors: List[str] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class LLMPlanResult:
    """Result from LLM-enhanced campaign planning."""

    success: bool
    intent_analysis: IntentAnalysis
    generated_files: List[GeneratedFile]
    parameter_manifest: Dict[str, ParameterSource]
    assumptions: List[str]
    warnings: List[str]
    errors: List[CampaignError]
    llm_interactions: int
    tokens_used: Dict[str, int]
    duration_ms: int


# =============================================================================
# LLM-Enhanced Planner
# =============================================================================

class LLMCampaignPlanner:
    """LLM-enhanced campaign planner using the agent abstraction layer.

    This planner uses LLM capabilities to:
    - Understand complex user intents
    - Generate appropriate simulation inputs
    - Repair validation failures
    - Provide intelligent recommendations

    Usage:
        planner = LLMCampaignPlanner()
        result = await planner.plan_campaign(
            intent="Run NVT equilibration at 300K for 1 ns",
            file_guides=[structure_guide],
            output_dir=Path("./output"),
        )
    """

    def __init__(
        self,
        provider: Optional[AgentProvider] = None,
        config: Optional[AgentConfig] = None,
        max_repair_attempts: int = 3,
    ):
        """Initialize the LLM planner.

        Args:
            provider: Optional custom provider
            config: Optional config
            max_repair_attempts: Maximum validation repair attempts
        """
        self._provider = provider
        self._config = config or AgentConfig(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            max_iterations=5,
        )
        self._max_repair_attempts = max_repair_attempts
        self._total_tokens = {"input_tokens": 0, "output_tokens": 0}
        self._llm_interactions = 0

    def _get_provider(self) -> AgentProvider:
        """Get or create the agent provider."""
        if self._provider is None:
            provider = get_best_available_provider()
            if provider is None:
                raise RuntimeError("No agent provider available. Check API key.")
            self._provider = provider
        return self._provider

    def _track_tokens(self, result: AgentResult) -> None:
        """Track token usage from result."""
        if result.usage:
            self._total_tokens["input_tokens"] += result.usage.get("input_tokens", 0)
            self._total_tokens["output_tokens"] += result.usage.get("output_tokens", 0)
        self._llm_interactions += 1

    async def analyze_intent(self, intent: str) -> IntentAnalysis:
        """Analyze user intent using LLM.

        Args:
            intent: User's natural language intent

        Returns:
            IntentAnalysis with structured extraction
        """
        prompt = INTENT_ANALYSIS_PROMPT.format(intent=intent)

        provider = self._get_provider()
        result = await provider.run(
            prompt=prompt,
            system_prompt="Extract simulation parameters from user intent. Return JSON.",
            tools=[],
        )
        self._track_tokens(result)

        if not result.success:
            # Return basic analysis on failure
            return IntentAnalysis(
                simulation_type="unknown",
                raw_response=result.error,
            )

        # Parse JSON response
        try:
            # Find JSON in response
            content = result.content
            json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return IntentAnalysis(
                    simulation_type=data.get("simulation_type", "unknown"),
                    target_temperature=data.get("target_temperature"),
                    target_pressure=data.get("target_pressure"),
                    run_duration=data.get("run_duration"),
                    engine=data.get("engine", "lammps"),
                    steps=data.get("steps", []),
                    parameters=data.get("parameters", {}),
                    ambiguities=data.get("ambiguities", []),
                    raw_response=content,
                )
        except json.JSONDecodeError:
            pass

        # Fallback: basic parsing
        intent_lower = intent.lower()
        sim_type = "unknown"
        if "minimize" in intent_lower:
            sim_type = "minimization"
        elif "nvt" in intent_lower:
            sim_type = "nvt"
        elif "npt" in intent_lower:
            sim_type = "npt"
        elif "nve" in intent_lower:
            sim_type = "nve"

        # Extract temperature
        temp_match = re.search(r"(\d+)\s*k", intent_lower)
        temp = float(temp_match.group(1)) if temp_match else None

        return IntentAnalysis(
            simulation_type=sim_type,
            target_temperature=temp,
            raw_response=result.content,
        )

    async def generate_input_with_llm(
        self,
        intent: IntentAnalysis,
        file_guides: List[FileGuide],
        output_dir: Path,
    ) -> Tuple[Optional[Path], Dict[str, ParameterSource], List[str]]:
        """Generate simulation input using LLM.

        Args:
            intent: Analyzed intent
            file_guides: Available file guides
            output_dir: Output directory

        Returns:
            Tuple of (output_path, parameter_manifest, warnings)
        """
        # Build context from file guides
        context = format_file_guides_for_agent(file_guides)
        ff_info = _extract_force_field_info(file_guides)

        # Build generation prompt
        prompt = f"""Generate a LAMMPS input file for the following simulation:

Simulation Type: {intent.simulation_type}
Temperature: {intent.target_temperature or 'Not specified'} K
Duration: {intent.run_duration or 'Not specified'}

Available File Information:
{context}

Force Field Summary:
- Pair Style: {ff_info.get('pair_style', 'NOT FOUND')}
- Pair Coefficients: {len(ff_info.get('pair_coeffs', []))} found
- Atom Types: {len(ff_info.get('atom_types', []))} found

Generate a complete, valid LAMMPS input script. Include comments citing the source of each parameter.
Return ONLY the input script content, nothing else."""

        provider = self._get_provider()
        result = await provider.run(
            prompt=prompt,
            system_prompt=CAMPAIGN_PLANNER_SYSTEM_PROMPT,
            tools=[],
        )
        self._track_tokens(result)

        if not result.success:
            return None, {}, [f"LLM generation failed: {result.error}"]

        # Extract script content
        content = result.content.strip()

        # Remove markdown code blocks if present
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1] == "```":
                lines = lines[:-1]
            content = "\n".join(lines)

        # Determine output filename
        filename_map = {
            "minimization": "in.minimize",
            "nvt": "in.nvt",
            "npt": "in.npt",
            "nve": "in.nve",
            "relax": "in.relax",
        }
        output_filename = filename_map.get(intent.simulation_type, "in.simulation")
        output_path = output_dir / output_filename

        # Write the file
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path.write_text(content)

        # Build basic manifest
        manifest: Dict[str, ParameterSource] = {}
        if intent.target_temperature:
            manifest["temperature"] = ParameterSource(
                value=str(intent.target_temperature),
                source_file="user_intent",
                source_location="parsed from intent",
                is_default=False,
            )

        return output_path, manifest, []

    async def repair_validation_errors(
        self,
        file_path: Path,
        validation_result: ValidationResult,
        file_guides: List[FileGuide],
    ) -> RepairResult:
        """Attempt to repair validation errors using LLM.

        Args:
            file_path: Path to file with errors
            validation_result: Validation result with errors
            file_guides: Available file guides for reference

        Returns:
            RepairResult with repaired content or error info
        """
        # Read current content
        try:
            current_content = file_path.read_text()
        except Exception as e:
            return RepairResult(
                success=False,
                error=f"Failed to read file: {e}",
            )

        # Build error summary
        error_lines = []
        unfixable = []
        for issue in validation_result.all_issues:
            msg = issue.get("message", str(issue))
            line_num = issue.get("line_number", "?")
            suggestion = issue.get("suggestion", "")

            if is_unfixable_error(issue):
                unfixable.append(msg)
            else:
                error_lines.append(f"Line {line_num}: {msg}")
                if suggestion:
                    error_lines.append(f"  Suggestion: {suggestion}")

        if unfixable and not error_lines:
            # All errors are unfixable
            return RepairResult(
                success=False,
                unfixable_errors=unfixable,
                error="All errors require user input to fix",
            )

        # Build repair prompt
        prompt = f"""Fix the following validation errors in this LAMMPS input file:

ERRORS:
{chr(10).join(error_lines)}

CURRENT FILE:
```
{current_content}
```

Available reference data:
{format_file_guides_for_agent(file_guides)[:2000]}

Return the COMPLETE corrected file. Explain changes as comments."""

        provider = self._get_provider()
        result = await provider.run(
            prompt=prompt,
            system_prompt=REPAIR_SYSTEM_PROMPT,
            tools=[],
        )
        self._track_tokens(result)

        if not result.success:
            return RepairResult(
                success=False,
                error=f"LLM repair failed: {result.error}",
                unfixable_errors=unfixable,
            )

        # Extract repaired content
        content = result.content.strip()

        # Remove markdown code blocks
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1] == "```":
                lines = lines[:-1]
            content = "\n".join(lines)

        return RepairResult(
            success=True,
            repaired_content=content,
            changes_made=["Applied LLM-suggested repairs"],
            unfixable_errors=unfixable,
        )

    async def plan_campaign(
        self,
        intent: str,
        file_guides: List[FileGuide],
        output_dir: Path,
        workspace: Optional[Path] = None,
    ) -> LLMPlanResult:
        """Plan and generate a simulation campaign using LLM.

        Args:
            intent: User's natural language intent
            file_guides: Available analyzed files
            output_dir: Output directory for generated files
            workspace: Optional workspace directory

        Returns:
            LLMPlanResult with complete planning results
        """
        start_time = time.time()
        self._total_tokens = {"input_tokens": 0, "output_tokens": 0}
        self._llm_interactions = 0

        errors: List[CampaignError] = []
        warnings: List[str] = []
        assumptions: List[str] = []
        generated_files: List[GeneratedFile] = []
        manifest: Dict[str, ParameterSource] = {}

        # Validate inputs
        if not file_guides:
            return LLMPlanResult(
                success=False,
                intent_analysis=IntentAnalysis(simulation_type="unknown"),
                generated_files=[],
                parameter_manifest={},
                assumptions=[],
                warnings=[],
                errors=[CampaignError(
                    code=ErrorCode.E301_MISSING_REQUIRED_FIELD,
                    severity=ErrorSeverity.FATAL,
                    message="No file guides provided",
                )],
                llm_interactions=0,
                tokens_used=self._total_tokens,
                duration_ms=int((time.time() - start_time) * 1000),
            )

        # Step 1: Analyze intent
        logger.info(f"Analyzing intent: {intent[:50]}...")
        intent_analysis = await self.analyze_intent(intent)

        if intent_analysis.ambiguities:
            for amb in intent_analysis.ambiguities:
                warnings.append(f"Ambiguity: {amb}")

        # Step 2: Generate input file
        logger.info(f"Generating {intent_analysis.simulation_type} input...")
        output_path, file_manifest, gen_warnings = await self.generate_input_with_llm(
            intent_analysis, file_guides, output_dir
        )

        manifest.update(file_manifest)
        warnings.extend(gen_warnings)

        if output_path is None:
            errors.append(CampaignError(
                code=ErrorCode.E202_AGENT_FAILED,
                severity=ErrorSeverity.ERROR,
                message="Failed to generate input file",
            ))
            return LLMPlanResult(
                success=False,
                intent_analysis=intent_analysis,
                generated_files=[],
                parameter_manifest=manifest,
                assumptions=assumptions,
                warnings=warnings,
                errors=errors,
                llm_interactions=self._llm_interactions,
                tokens_used=self._total_tokens,
                duration_ms=int((time.time() - start_time) * 1000),
            )

        # Step 3: Validate the generated file
        logger.info("Validating generated file...")
        validation_result = validate_deck(
            output_path,
            engine=intent_analysis.engine,
            levels=["L0", "L1", "L3"],
        )

        # Step 4: Repair if needed
        repair_attempts = 0
        while not validation_result.can_run and repair_attempts < self._max_repair_attempts:
            repair_attempts += 1
            logger.info(f"Attempting repair {repair_attempts}...")

            repair_result = await self.repair_validation_errors(
                output_path, validation_result, file_guides
            )

            if not repair_result.success:
                warnings.append(f"Repair attempt {repair_attempts} failed: {repair_result.error}")
                if repair_result.unfixable_errors:
                    for ue in repair_result.unfixable_errors:
                        errors.append(CampaignError(
                            code=ErrorCode.E301_MISSING_REQUIRED_FIELD,
                            severity=ErrorSeverity.ERROR,
                            message=ue,
                            file_path=str(output_path),
                        ))
                break

            # Write repaired content
            if repair_result.repaired_content:
                output_path.write_text(repair_result.repaired_content)

            # Re-validate
            validation_result = validate_deck(
                output_path,
                engine=intent_analysis.engine,
                levels=["L0", "L1", "L3"],
            )

        # Create GeneratedFile
        gen_file = GeneratedFile(
            path=output_path,
            purpose=intent_analysis.simulation_type.replace("_", " ").title(),
            engine=intent_analysis.engine,
            validation=validation_result,
        )
        generated_files.append(gen_file)

        # Add assumptions from intent analysis
        if intent_analysis.target_temperature is None:
            assumptions.append("Using default temperature of 300 K")
        if intent_analysis.run_duration is None:
            assumptions.append("Using default run duration")

        # Determine success
        success = (
            len(errors) == 0 and
            all(gf.validation and gf.validation.can_run for gf in generated_files)
        )

        duration_ms = int((time.time() - start_time) * 1000)

        return LLMPlanResult(
            success=success,
            intent_analysis=intent_analysis,
            generated_files=generated_files,
            parameter_manifest=manifest,
            assumptions=assumptions,
            warnings=warnings,
            errors=errors,
            llm_interactions=self._llm_interactions,
            tokens_used=self._total_tokens,
            duration_ms=duration_ms,
        )


# =============================================================================
# Convenience Functions
# =============================================================================

async def llm_plan_campaign(
    intent: str,
    file_guides: List[FileGuide],
    output_dir: Path,
) -> LLMPlanResult:
    """Convenience function for quick campaign planning.

    Args:
        intent: User's intent
        file_guides: Available file guides
        output_dir: Output directory

    Returns:
        LLMPlanResult
    """
    planner = LLMCampaignPlanner()
    return await planner.plan_campaign(intent, file_guides, output_dir)


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "LLMCampaignPlanner",
    "IntentAnalysis",
    "RepairResult",
    "LLMPlanResult",
    "llm_plan_campaign",
]
