"""
LLM-Enhanced File Analyzer.

This module integrates LLM capabilities into the FileAnalyzer to provide
richer, more contextual analysis of simulation files. It uses the agent
abstraction layer for provider-agnostic LLM access.

Key Features:
    - Enhanced file summarization using LLM
    - Semantic understanding of file purpose
    - Identification of potential issues and recommendations
    - Parameter extraction from complex formats

The LLM enhancement is optional - deterministic parsing is always run first,
and LLM analysis can be used to enrich the results when needed.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .interface import AgentConfig, AgentProvider, AgentResult
from .factory import get_best_available_provider
from .registry import default_registry
from .tool_types import ToolDefinition


logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

# Maximum file content to send to LLM (to manage token usage)
MAX_LLM_CONTENT_CHARS = 20000

# System prompts for different analysis types
LAMMPS_DATA_SYSTEM_PROMPT = """You are an expert in LAMMPS molecular dynamics simulations.
Analyze the provided LAMMPS data file and extract key information.
Focus on:
- System composition (atoms, molecules, types)
- Force field parameters (pair coefficients, bonds, angles)
- Box dimensions and periodicity
- Any potential issues or unusual configurations

Provide concise, technical analysis. Use JSON format for structured data."""

LAMMPS_INPUT_SYSTEM_PROMPT = """You are an expert in LAMMPS molecular dynamics simulations.
Analyze the provided LAMMPS input script and explain:
- Simulation type and purpose
- Key simulation parameters (timestep, temperature, pressure)
- Output specifications
- Potential issues or best practice violations

Provide concise, technical analysis. Flag any warnings."""

QE_SYSTEM_PROMPT = """You are an expert in Quantum ESPRESSO DFT calculations.
Analyze the provided QE input file and extract:
- Calculation type (scf, relax, vc-relax, etc.)
- Convergence parameters (ecutwfc, k-points, smearing)
- Pseudopotential selection
- System setup (atoms, cell, constraints)

Provide concise, technical analysis. Flag any concerns."""

GENERIC_SYSTEM_PROMPT = """You are an expert in computational materials science.
Analyze the provided file and determine:
- File type and purpose
- Key parameters and their values
- Compatibility with simulation workflows
- Any issues or recommendations

Provide concise, technical analysis."""


# =============================================================================
# Result Types
# =============================================================================


@dataclass
class LLMAnalysisResult:
    """Result of LLM-enhanced file analysis.

    Attributes:
        success: Whether analysis succeeded
        summary: Enhanced summary of the file
        purpose: Detected purpose of the file
        parameters: Extracted parameters as dict
        issues: Identified issues or concerns
        recommendations: Suggested improvements
        raw_response: Full LLM response
        tokens_used: Token usage (input, output)
        duration_ms: Analysis time in milliseconds
        error: Error message if failed
    """

    success: bool
    summary: Optional[str] = None
    purpose: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    issues: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    raw_response: Optional[str] = None
    tokens_used: Optional[Dict[str, int]] = None
    duration_ms: int = 0
    error: Optional[str] = None


# =============================================================================
# LLM-Enhanced Analyzer
# =============================================================================


class LLMFileAnalyzer:
    """LLM-enhanced file analyzer using the agent abstraction layer.

    This analyzer uses LLM capabilities to provide richer analysis than
    purely deterministic parsing. It's designed to complement, not replace,
    the standard FileAnalyzer.

    Usage:
        analyzer = LLMFileAnalyzer()
        result = await analyzer.analyze_file(path)
    """

    def __init__(
        self,
        provider: Optional[AgentProvider] = None,
        config: Optional[AgentConfig] = None,
        use_tools: bool = False,
    ):
        """Initialize the LLM analyzer.

        Args:
            provider: Optional custom provider (uses factory if not provided)
            config: Optional config (uses defaults if not provided)
            use_tools: Whether to provide file tools to LLM
        """
        self._provider = provider
        self._config = config or AgentConfig(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            max_iterations=3,
        )
        self._use_tools = use_tools

    def _get_provider(self) -> AgentProvider:
        """Get or create the agent provider."""
        if self._provider is None:
            # Use best available provider
            provider = get_best_available_provider()
            if provider is None:
                raise RuntimeError("No agent provider available. Check API key.")
            self._provider = provider
        return self._provider

    def _get_system_prompt(self, file_type: str) -> str:
        """Get appropriate system prompt for file type."""
        prompts = {
            "lammps_data": LAMMPS_DATA_SYSTEM_PROMPT,
            "lammps_input": LAMMPS_INPUT_SYSTEM_PROMPT,
            "qe_input": QE_SYSTEM_PROMPT,
        }
        return prompts.get(file_type, GENERIC_SYSTEM_PROMPT)

    def _detect_file_type(self, path: Path) -> str:
        """Detect file type from path."""
        suffix = path.suffix.lower()
        name = path.name.lower()

        if suffix == ".data" or "lammps" in name:
            # Check if it's a data file or input
            if suffix == ".data":
                return "lammps_data"
            elif suffix == ".in":
                return "lammps_input"
            return "lammps_data"  # Default for .lammps extension

        if suffix in (".pwi", ".in") and "qe" in name.lower():
            return "qe_input"

        if suffix in (".pwi",):
            return "qe_input"

        return "generic"

    def _truncate_content(self, content: str, max_chars: int = MAX_LLM_CONTENT_CHARS) -> str:
        """Truncate content for LLM with indicator."""
        if len(content) <= max_chars:
            return content

        # Keep beginning and end
        half = (max_chars - 100) // 2
        return (
            content[:half]
            + f"\n\n[... {len(content) - 2*half} characters truncated ...]\n\n"
            + content[-half:]
        )

    def _build_prompt(self, content: str, file_path: Path, file_type: str) -> str:
        """Build the analysis prompt."""
        return f"""Analyze this {file_type.replace('_', ' ')} file:

File: {file_path.name}

Content:
```
{content}
```

Provide:
1. A concise summary (1-2 sentences)
2. The purpose of this file
3. Key parameters found (as bullet points)
4. Any issues or concerns
5. Recommendations if applicable

Be concise and technical."""

    async def analyze_file(
        self,
        file_path: Union[str, Path],
        additional_context: Optional[str] = None,
    ) -> LLMAnalysisResult:
        """Analyze a file using LLM enhancement.

        Args:
            file_path: Path to the file to analyze
            additional_context: Optional additional context for the LLM

        Returns:
            LLMAnalysisResult with enhanced analysis
        """
        path = Path(file_path).resolve()

        if not path.exists():
            return LLMAnalysisResult(
                success=False,
                error=f"File not found: {path}",
            )

        # Read file content
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            return LLMAnalysisResult(
                success=False,
                error=f"Failed to read file: {e}",
            )

        file_type = self._detect_file_type(path)
        truncated_content = self._truncate_content(content)

        # Build prompt
        prompt = self._build_prompt(truncated_content, path, file_type)
        if additional_context:
            prompt += f"\n\nAdditional context:\n{additional_context}"

        system_prompt = self._get_system_prompt(file_type)

        # Get tools if needed
        tools: List[ToolDefinition] = []
        if self._use_tools:
            tools = list(default_registry.filter_by_category("utilities"))

        # Run LLM analysis
        try:
            provider = self._get_provider()
            result = await provider.run(
                prompt=prompt,
                system_prompt=system_prompt,
                tools=tools,
            )

            if not result.success:
                return LLMAnalysisResult(
                    success=False,
                    error=result.error or "LLM analysis failed",
                    duration_ms=result.duration_ms,
                )

            # Parse the response
            return self._parse_llm_response(result)

        except Exception as e:
            logger.exception(f"LLM analysis failed for {path}")
            return LLMAnalysisResult(
                success=False,
                error=str(e),
            )

    def _parse_llm_response(self, result: AgentResult) -> LLMAnalysisResult:
        """Parse LLM response into structured result."""
        content = result.content

        # Simple extraction of sections
        summary = None
        purpose = None
        issues: List[str] = []
        recommendations: List[str] = []
        parameters: Dict[str, Any] = {}

        # Try to extract summary (first paragraph or line)
        lines = content.split("\n")
        for line in lines:
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("*"):
                summary = line
                break

        # Look for common section patterns
        current_section = None
        for line in lines:
            line_lower = line.lower().strip()

            if "purpose" in line_lower:
                current_section = "purpose"
            elif "issue" in line_lower or "concern" in line_lower or "warning" in line_lower:
                current_section = "issues"
            elif "recommend" in line_lower or "suggestion" in line_lower:
                current_section = "recommendations"
            elif "parameter" in line_lower or "key" in line_lower:
                current_section = "parameters"
            elif line.startswith("- ") or line.startswith("* "):
                item = line[2:].strip()
                if current_section == "issues":
                    issues.append(item)
                elif current_section == "recommendations":
                    recommendations.append(item)
                elif current_section == "parameters":
                    # Try to extract key: value
                    if ":" in item:
                        key, value = item.split(":", 1)
                        parameters[key.strip()] = value.strip()
            elif current_section == "purpose" and line.strip():
                purpose = line.strip()
                current_section = None

        return LLMAnalysisResult(
            success=True,
            summary=summary,
            purpose=purpose,
            parameters=parameters,
            issues=issues,
            recommendations=recommendations,
            raw_response=content,
            tokens_used=result.usage,
            duration_ms=result.duration_ms,
        )

    async def enhance_file_guide(
        self,
        file_guide: Any,
        max_content_chars: int = MAX_LLM_CONTENT_CHARS,
    ) -> LLMAnalysisResult:
        """Enhance an existing FileGuide with LLM analysis.

        Args:
            file_guide: FileGuide object to enhance
            max_content_chars: Maximum content to send to LLM

        Returns:
            LLMAnalysisResult that can be merged with FileGuide
        """
        path = Path(file_guide.file_path)

        # Build context from existing FileGuide
        context_parts = []
        if hasattr(file_guide, "atom_count") and file_guide.atom_count:
            context_parts.append(f"Atom count: {file_guide.atom_count}")
        if hasattr(file_guide, "atom_types_count") and file_guide.atom_types_count:
            context_parts.append(f"Atom types: {file_guide.atom_types_count}")
        if hasattr(file_guide, "box_dimensions") and file_guide.box_dimensions:
            box = file_guide.box_dimensions
            context_parts.append(f"Box: {box.lx:.2f} x {box.ly:.2f} x {box.lz:.2f}")

        additional_context = "\n".join(context_parts) if context_parts else None

        return await self.analyze_file(path, additional_context)


# =============================================================================
# Convenience Functions
# =============================================================================


async def llm_analyze_file(
    file_path: Union[str, Path],
    provider: Optional[AgentProvider] = None,
) -> LLMAnalysisResult:
    """Convenience function for quick LLM analysis.

    Args:
        file_path: Path to analyze
        provider: Optional provider to use

    Returns:
        LLMAnalysisResult
    """
    analyzer = LLMFileAnalyzer(provider=provider)
    return await analyzer.analyze_file(file_path)


async def batch_llm_analyze(
    file_paths: List[Union[str, Path]],
    max_concurrent: int = 3,
) -> List[LLMAnalysisResult]:
    """Analyze multiple files with LLM in parallel.

    Args:
        file_paths: List of file paths
        max_concurrent: Maximum concurrent analyses

    Returns:
        List of LLMAnalysisResult
    """
    analyzer = LLMFileAnalyzer()
    semaphore = asyncio.Semaphore(max_concurrent)

    async def analyze_with_limit(path: Union[str, Path]) -> LLMAnalysisResult:
        async with semaphore:
            return await analyzer.analyze_file(path)

    tasks = [analyze_with_limit(p) for p in file_paths]
    return await asyncio.gather(*tasks)


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "LLMFileAnalyzer",
    "LLMAnalysisResult",
    "llm_analyze_file",
    "batch_llm_analyze",
]
