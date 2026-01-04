"""
Validation Tool Wrappers for Agent System.

This module wraps the existing validation tools (L0-L3) as ToolDefinition objects
and registers them with the default registry.

Tools registered:
    - validate_l0: Check for placeholder patterns
    - validate_lammps_syntax: Check LAMMPS input syntax (L1)
    - validate_qe_syntax: Check Quantum ESPRESSO input syntax (L1)
    - validate_engine: Run engine in check mode (L2)
    - check_physics: Physics sanity checks (L3)
    - validate_full: Run complete validation pipeline

Importing this module registers all tools with the default registry.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict

from campaign_builder.tools.validation import (
    # L0
    L0Result,
    validate_l0,
    validate_l0_content,
    # L1 LAMMPS
    L1LAMMPSResult,
    validate_l1_lammps,
    validate_l1_lammps_content,
    # L1 QE
    L1QEResult,
    validate_l1_qe,
    validate_l1_qe_content,
    # L2
    L2Result,
    validate_l2,
    validate_l2_lammps,
    validate_l2_qe,
    # L3
    L3Result,
    validate_l3,
    validate_l3_content,
    # Unified
    ValidationResult,
    validate_deck,
    validate_deck_content,
)

from ..tool_types import ToolDefinition, ToolError, build_tool_schema, string_param, boolean_param, enum_param
from ..registry import default_registry


logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

CATEGORY = "validation"


# =============================================================================
# Helper Functions
# =============================================================================


def _l0_result_to_json(result: L0Result) -> str:
    """Convert L0Result to JSON for LLM."""
    return json.dumps({
        "passed": result.passed,
        "level": "L0",
        "placeholders": [
            {
                "pattern": m.get("pattern", "unknown"),
                "match": m.get("matched_text", ""),
                "line": m.get("line_num", 0),
                "context": m.get("context", ""),
            }
            for m in result.placeholders
        ],
        "summary": f"{'No placeholders found' if result.passed else f'{len(result.placeholders)} placeholder(s) found'}",
    }, indent=2)


def _l1_lammps_result_to_json(result: L1LAMMPSResult) -> str:
    """Convert L1LAMMPSResult to JSON for LLM."""
    return json.dumps({
        "passed": result.passed,
        "level": "L1_LAMMPS",
        "errors": [
            {
                "code": e.get("code", ""),
                "message": e.get("message", ""),
                "suggestion": e.get("suggestion", ""),
            }
            for e in result.errors
        ],
        "warnings": [
            {
                "code": w.get("code", ""),
                "message": w.get("message", ""),
                "suggestion": w.get("suggestion", ""),
            }
            for w in result.warnings
        ],
        "summary": f"{'Valid LAMMPS syntax' if result.passed else f'{len(result.errors)} error(s)'}",
    }, indent=2)


def _l1_qe_result_to_json(result: L1QEResult) -> str:
    """Convert L1QEResult to JSON for LLM."""
    return json.dumps({
        "passed": result.passed,
        "level": "L1_QE",
        "errors": [
            {
                "code": e.get("code", ""),
                "message": e.get("message", ""),
                "suggestion": e.get("suggestion", ""),
            }
            for e in result.errors
        ],
        "warnings": [
            {
                "code": w.get("code", ""),
                "message": w.get("message", ""),
                "suggestion": w.get("suggestion", ""),
            }
            for w in result.warnings
        ],
        "summary": f"{'Valid QE syntax' if result.passed else f'{len(result.errors)} error(s)'}",
    }, indent=2)


def _l2_result_to_json(result: L2Result) -> str:
    """Convert L2Result to JSON for LLM."""
    engine_output = result.engine_output if hasattr(result, 'engine_output') else None
    errors = result.errors if hasattr(result, 'errors') else []
    return json.dumps({
        "passed": result.passed,
        "skipped": result.skipped,
        "level": "L2",
        "skip_reason": result.skip_reason,
        "engine_output": engine_output[:500] if engine_output else None,
        "errors": errors,
        "summary": (
            "Skipped - engine not available" if result.skipped
            else ("Engine accepts input" if result.passed else f"Engine rejected: {errors}")
        ),
    }, indent=2)


def _l3_result_to_json(result: L3Result) -> str:
    """Convert L3Result to JSON for LLM."""
    return json.dumps({
        "passed": result.passed,
        "level": "L3",
        "warnings": [
            {
                "name": w.get("name", ""),
                "severity": w.get("severity", ""),
                "message": w.get("message", ""),
                "value": w.get("value"),
            }
            for w in result.warnings
        ],
        "physics_checks": [
            {
                "name": c.get("name", ""),
                "passed": c.get("passed", True),
                "message": c.get("message", ""),
            }
            for c in result.physics_checks
        ],
        "summary": f"{'Physics checks passed' if result.passed else f'{len(result.warnings)} warning(s)'}",
    }, indent=2)


def _validation_result_to_json(result: ValidationResult) -> str:
    """Convert full ValidationResult to JSON for LLM."""
    data = {
        "overall_passed": result.overall_passed,
        "can_run": result.can_run,
        "levels_run": result.levels_run,
        "engine": result.engine,
        "all_issues": result.all_issues,
        "suggestions": result.suggestions,
    }

    if result.l0:
        data["l0"] = {
            "passed": result.l0.passed,
            "placeholders": len(result.l0.placeholders),
        }

    if result.l1:
        data["l1"] = {
            "passed": result.l1.passed,
            "errors": len(result.l1.errors),
            "warnings": len(result.l1.warnings),
        }

    if result.l2:
        data["l2"] = {
            "passed": result.l2.passed,
            "skipped": result.l2.skipped,
        }

    if result.l3:
        data["l3"] = {
            "passed": result.l3.passed,
            "warnings": len(result.l3.warnings),
        }

    return json.dumps(data, indent=2)


# =============================================================================
# L0 Tool - Placeholder Detection
# =============================================================================


async def _validate_l0_handler(args: Dict[str, Any]) -> str:
    """Handler for validate_l0 tool.

    Args:
        args: Tool arguments with 'content'

    Returns:
        JSON result
    """
    content = args.get("content")
    if not content:
        raise ToolError("Missing required parameter: content")

    result = validate_l0_content(content)
    return _l0_result_to_json(result)


validate_l0_tool = ToolDefinition(
    name="validate_l0",
    description="Check a file for placeholder patterns like {{VALUE}} or TODO. Returns list of found placeholders or confirmation that none exist.",
    parameters=build_tool_schema(
        properties={
            "content": string_param("File content to validate for placeholders"),
        },
        required=["content"],
    ),
    handler=_validate_l0_handler,
    category=CATEGORY,
)


# =============================================================================
# L1 LAMMPS Tool - Syntax Validation
# =============================================================================


async def _validate_lammps_syntax_handler(args: Dict[str, Any]) -> str:
    """Handler for validate_lammps_syntax tool.

    Args:
        args: Tool arguments with 'content'

    Returns:
        JSON result
    """
    content = args.get("content")
    if not content:
        raise ToolError("Missing required parameter: content")

    result = validate_l1_lammps_content(content)
    return _l1_lammps_result_to_json(result)


validate_lammps_syntax_tool = ToolDefinition(
    name="validate_lammps_syntax",
    description="Check LAMMPS input file syntax. Validates commands, required keywords, and common errors. Returns JSON with passed/failed, errors list, warnings list.",
    parameters=build_tool_schema(
        properties={
            "content": string_param("LAMMPS input file content to validate"),
        },
        required=["content"],
    ),
    handler=_validate_lammps_syntax_handler,
    category=CATEGORY,
)


# =============================================================================
# L1 QE Tool - Syntax Validation
# =============================================================================


async def _validate_qe_syntax_handler(args: Dict[str, Any]) -> str:
    """Handler for validate_qe_syntax tool.

    Args:
        args: Tool arguments with 'content'

    Returns:
        JSON result
    """
    content = args.get("content")
    if not content:
        raise ToolError("Missing required parameter: content")

    result = validate_l1_qe_content(content)
    return _l1_qe_result_to_json(result)


validate_qe_syntax_tool = ToolDefinition(
    name="validate_qe_syntax",
    description="Check Quantum ESPRESSO input file syntax. Validates namelists, cards, and required parameters. Returns JSON with passed/failed, errors list, warnings list.",
    parameters=build_tool_schema(
        properties={
            "content": string_param("QE input file content to validate"),
        },
        required=["content"],
    ),
    handler=_validate_qe_syntax_handler,
    category=CATEGORY,
)


# =============================================================================
# L2 Tool - Engine Acceptance
# =============================================================================


async def _validate_engine_handler(args: Dict[str, Any]) -> str:
    """Handler for validate_engine tool.

    Args:
        args: Tool arguments with 'path' and 'engine'

    Returns:
        JSON result
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    engine = args.get("engine")
    if not engine:
        raise ToolError("Missing required parameter: engine")

    path = Path(path_str)
    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    engine = engine.lower()
    if engine == "lammps":
        result = validate_l2_lammps(path)
    elif engine in ("qe", "quantum_espresso", "quantumespresso"):
        result = validate_l2_qe(path)
    else:
        raise ToolError(f"Unknown engine: {engine}. Use 'lammps' or 'qe'.")

    return _l2_result_to_json(result)


validate_engine_tool = ToolDefinition(
    name="validate_engine",
    description="Run the simulation engine in check mode to verify it accepts the input file. More thorough than syntax checking. Returns JSON with passed/skipped status, output, and errors.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to input file to validate"),
            "engine": enum_param(
                "Engine name",
                values=["lammps", "qe"],
            ),
        },
        required=["path", "engine"],
    ),
    handler=_validate_engine_handler,
    category=CATEGORY,
)


# =============================================================================
# L3 Tool - Physics Checks
# =============================================================================


async def _check_physics_handler(args: Dict[str, Any]) -> str:
    """Handler for check_physics tool.

    Args:
        args: Tool arguments with 'content' and 'engine'

    Returns:
        JSON result
    """
    content = args.get("content")
    if not content:
        raise ToolError("Missing required parameter: content")

    engine = args.get("engine")
    if not engine:
        raise ToolError("Missing required parameter: engine")

    engine = engine.lower()
    result = validate_l3_content(content, engine=engine)
    return _l3_result_to_json(result)


check_physics_tool = ToolDefinition(
    name="check_physics",
    description="Perform physics sanity checks on simulation parameters. Warns about unrealistic values like extreme temperatures, pressures, or timesteps. Returns JSON with warnings list.",
    parameters=build_tool_schema(
        properties={
            "content": string_param("Input file content to check"),
            "engine": enum_param(
                "Engine name for physics interpretation",
                values=["lammps", "qe"],
            ),
        },
        required=["content", "engine"],
    ),
    handler=_check_physics_handler,
    category=CATEGORY,
)


# =============================================================================
# Full Validation Tool
# =============================================================================


async def _validate_full_handler(args: Dict[str, Any]) -> str:
    """Handler for validate_full tool.

    Args:
        args: Tool arguments with 'path', optional 'engine', 'stop_on_fail'

    Returns:
        JSON result
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = Path(path_str)
    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    engine = args.get("engine")  # Can be None for auto-detection
    stop_on_fail = args.get("stop_on_fail", True)

    result = validate_deck(path, engine=engine, stop_on_blocking_fail=stop_on_fail)
    return _validation_result_to_json(result)


validate_full_tool = ToolDefinition(
    name="validate_full",
    description="Run complete validation pipeline (L0 → L1 → L2 → L3) on a file. Returns comprehensive JSON report with results from each level.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to input file to validate"),
            "engine": enum_param(
                "Engine name (auto-detected if not provided)",
                values=["lammps", "qe"],
                required=False,
            ),
            "stop_on_fail": boolean_param(
                "Stop at first failure (default: false)",
                required=False,
                default=False,
            ),
        },
        required=["path"],
    ),
    handler=_validate_full_handler,
    category=CATEGORY,
)


# =============================================================================
# Registration
# =============================================================================

# Register all validation tools on import
default_registry.register(validate_l0_tool)
default_registry.register(validate_lammps_syntax_tool)
default_registry.register(validate_qe_syntax_tool)
default_registry.register(validate_engine_tool)
default_registry.register(check_physics_tool)
default_registry.register(validate_full_tool)

logger.debug(f"Registered {CATEGORY} tools: validate_l0, validate_lammps_syntax, validate_qe_syntax, validate_engine, check_physics, validate_full")


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "validate_l0_tool",
    "validate_lammps_syntax_tool",
    "validate_qe_syntax_tool",
    "validate_engine_tool",
    "check_physics_tool",
    "validate_full_tool",
]
