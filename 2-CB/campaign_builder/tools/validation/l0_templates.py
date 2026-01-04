"""
L0 Validation - Template Completeness.

This module provides L0 validation that detects placeholder patterns in generated files,
ensuring no incomplete generation. L0 is a BLOCKING validation level.

Placeholder patterns detected:
    - Handlebars: {{variable}}
    - Shell variables: ${VAR}
    - Angle brackets: <PLACEHOLDER>
    - Explicit markers: [PLACEHOLDER], [FILL_IN]
    - TODO markers: TODO, FIXME, XXX
    - Question marks: ???
    - Underscore fills: _____ (5+)
    - TBD markers: TBD

Usage:
    from campaign_builder.tools.validation.l0_templates import validate_l0, L0Result

    result = validate_l0(Path("input.lmp"))
    if not result.passed:
        for placeholder in result.placeholders:
            print(f"Line {placeholder['line_num']}: {placeholder['pattern']}")
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


# =============================================================================
# Placeholder Pattern Definitions
# =============================================================================

# Compile patterns once at module load for efficiency
PLACEHOLDER_PATTERNS: List[Dict[str, Any]] = [
    {
        "name": "handlebars",
        "pattern": re.compile(r"\{\{[^}]+\}\}"),
        "description": "Handlebars template variable {{variable}}",
    },
    {
        "name": "shell_var",
        "pattern": re.compile(r"\$\{[^}]+\}"),
        "description": "Shell variable ${VAR}",
    },
    {
        "name": "angle_bracket",
        "pattern": re.compile(r"<[A-Z_][A-Z0-9_]*>"),
        "description": "Angle bracket placeholder <PLACEHOLDER>",
    },
    {
        "name": "placeholder_marker",
        "pattern": re.compile(r"\[PLACEHOLDER\]", re.IGNORECASE),
        "description": "Explicit [PLACEHOLDER] marker",
    },
    {
        "name": "fill_marker",
        "pattern": re.compile(r"\[FILL[^\]]*\]", re.IGNORECASE),
        "description": "Fill-in marker [FILL_IN]",
    },
    {
        "name": "todo",
        "pattern": re.compile(r"\bTODO:?\b", re.IGNORECASE),
        "description": "TODO marker",
    },
    {
        "name": "fixme",
        "pattern": re.compile(r"\bFIXME:?\b", re.IGNORECASE),
        "description": "FIXME marker",
    },
    {
        "name": "xxx",
        "pattern": re.compile(r"\bXXX\b"),
        "description": "XXX marker",
    },
    {
        "name": "question_marks",
        "pattern": re.compile(r"\?\?\?+"),
        "description": "Question mark placeholder ???",
    },
    {
        "name": "underscore_fill",
        "pattern": re.compile(r"_{5,}"),
        "description": "Underscore placeholder _____",
    },
    {
        "name": "tbd",
        "pattern": re.compile(r"\bTBD\b", re.IGNORECASE),
        "description": "TBD marker",
    },
]


# =============================================================================
# Result Dataclasses
# =============================================================================


@dataclass
class PlaceholderMatch:
    """Information about a detected placeholder.

    Attributes:
        pattern_type: Type of placeholder pattern matched
        matched_text: The actual matched string
        line_number: 1-indexed line number
        column: Character position in line (0-indexed)
        context: Surrounding text for context
        description: Human-readable description of pattern type
    """

    pattern_type: str
    matched_text: str
    line_number: int
    column: int
    context: str
    description: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "pattern": self.pattern_type,
            "matched_text": self.matched_text,
            "line_num": self.line_number,
            "column": self.column,
            "context": self.context,
            "line_content": self.context,  # Alias for compatibility
            "description": self.description,
        }


@dataclass
class L0Result:
    """Result of L0 template completeness validation.

    Attributes:
        passed: True if no placeholders were found
        placeholders: List of placeholder match dictionaries
        total_placeholders: Count of all placeholders found
        lines_checked: Number of lines scanned
        error: Error message if file could not be read
    """

    passed: bool
    placeholders: List[Dict[str, Any]] = field(default_factory=list)
    total_placeholders: int = 0
    lines_checked: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "passed": self.passed,
            "placeholders": self.placeholders,
            "total_placeholders": self.total_placeholders,
            "lines_checked": self.lines_checked,
            "error": self.error,
        }


# =============================================================================
# Validation Functions
# =============================================================================


def _extract_context(line: str, match_start: int, match_end: int, context_chars: int = 20) -> str:
    """Extract context around a match.

    Args:
        line: The full line text
        match_start: Start position of match
        match_end: End position of match
        context_chars: Number of characters to include on each side

    Returns:
        Context string with truncation indicators if needed
    """
    # Calculate context boundaries
    ctx_start = max(0, match_start - context_chars)
    ctx_end = min(len(line), match_end + context_chars)

    # Build context string
    prefix = "..." if ctx_start > 0 else ""
    suffix = "..." if ctx_end < len(line) else ""

    context = prefix + line[ctx_start:ctx_end].strip() + suffix
    return context


def validate_l0_content(content: str) -> L0Result:
    """Validate content for placeholder patterns.

    Args:
        content: String content to validate

    Returns:
        L0Result with validation results
    """
    lines = content.split("\n")
    all_matches: List[Dict[str, Any]] = []

    for line_idx, line in enumerate(lines):
        line_number = line_idx + 1  # 1-indexed

        for pattern_info in PLACEHOLDER_PATTERNS:
            pattern = pattern_info["pattern"]
            pattern_name = pattern_info["name"]
            description = pattern_info["description"]

            for match in pattern.finditer(line):
                context = _extract_context(line, match.start(), match.end())

                placeholder_match = PlaceholderMatch(
                    pattern_type=pattern_name,
                    matched_text=match.group(),
                    line_number=line_number,
                    column=match.start(),
                    context=context,
                    description=description,
                )
                all_matches.append(placeholder_match.to_dict())

    return L0Result(
        passed=len(all_matches) == 0,
        placeholders=all_matches,
        total_placeholders=len(all_matches),
        lines_checked=len(lines),
    )


def validate_l0(file_path: Union[str, Path]) -> L0Result:
    """Validate a file for placeholder patterns.

    Args:
        file_path: Path to file to validate

    Returns:
        L0Result with validation results

    Note:
        If file cannot be read, returns a failed result with error message.
    """
    path = Path(file_path)

    # Check file exists
    if not path.exists():
        return L0Result(
            passed=False,
            error=f"File not found: {path}",
        )

    # Check it's a file
    if not path.is_file():
        return L0Result(
            passed=False,
            error=f"Not a file: {path}",
        )

    # Try to read file
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Try with latin-1 as fallback
        try:
            content = path.read_text(encoding="latin-1")
        except Exception as e:
            return L0Result(
                passed=False,
                error=f"Cannot decode file: {e}",
            )
    except Exception as e:
        return L0Result(
            passed=False,
            error=f"Cannot read file: {e}",
        )

    return validate_l0_content(content)


def format_l0_report(result: L0Result) -> str:
    """Format L0 validation result as human-readable report.

    Args:
        result: L0Result to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    status = "PASSED" if result.passed else "FAILED"
    lines.append(f"## L0 Validation: {status}")
    lines.append("")

    # Error if present
    if result.error:
        lines.append(f"**Error:** {result.error}")
        lines.append("")
        return "\n".join(lines)

    # Summary
    lines.append(f"**Placeholders found:** {result.total_placeholders}")
    lines.append(f"**Lines checked:** {result.lines_checked}")
    lines.append("")

    # Details
    if result.placeholders:
        lines.append("### Placeholder Details")
        lines.append("")

        for ph in result.placeholders:
            lines.append(
                f"**Line {ph['line_num']}:** `{ph['matched_text']}` ({ph['pattern']})"
            )
            lines.append(f"  Context: \"{ph['context']}\"")
            lines.append("")

    return "\n".join(lines)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "PLACEHOLDER_PATTERNS",
    "PlaceholderMatch",
    "L0Result",
    "validate_l0",
    "validate_l0_content",
    "format_l0_report",
]
