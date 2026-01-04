"""
Command-line interface for Campaign Builder.

This module provides the main entry points for the campaign-builder CLI tool.
"""

import argparse
import asyncio
import json
import logging
import signal
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, List, Optional

from campaign_builder import __version__
from campaign_builder.schemas.errors import CampaignError, ErrorCode, ErrorSeverity


# Configure logging
logger = logging.getLogger(__name__)


def configure_logging(verbosity: int, quiet: bool) -> None:
    """Configure logging based on CLI flags."""
    if quiet:
        level = logging.ERROR
    elif verbosity == 0:
        level = logging.WARNING
    elif verbosity == 1:
        level = logging.INFO
    else:
        level = logging.DEBUG

    # Set root logger level directly (basicConfig won't override existing config)
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Configure format if no handlers exist
    if not root_logger.handlers:
        logging.basicConfig(
            level=level,
            format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%H:%M:%S'
        )

    # Quiet noisy libraries
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('anthropic').setLevel(logging.WARNING)


class ConsoleProgressReporter:
    """Simple console progress reporter."""

    def __init__(self, quiet: bool = False):
        self.quiet = quiet
        self.total = 0
        self.current = 0

    def start(self, total: int, description: str) -> None:
        self.total = total
        self.current = 0
        if not self.quiet:
            print(f"[0/{total}] {description}")

    def update(self, current: int, message: str) -> None:
        self.current = current
        if not self.quiet:
            print(f"[{current}/{self.total}] {message}")

    def finish(self, message: str) -> None:
        if not self.quiet:
            print(f"[{self.total}/{self.total}] {message}")

    def error(self, message: str) -> None:
        print(f"ERROR: {message}", file=sys.stderr)

    def __call__(self, stage: str, progress: float, message: str) -> None:
        """Callback for orchestration progress."""
        if not self.quiet:
            pct = int(progress * 100)
            print(f"[{stage}] {pct}% - {message}")


def format_error(error: CampaignError) -> str:
    """Format error for CLI display."""
    severity_icons = {
        ErrorSeverity.INFO: "INFO",
        ErrorSeverity.WARNING: "WARN",
        ErrorSeverity.ERROR: "ERR ",
        ErrorSeverity.FATAL: "FATL"
    }

    icon = severity_icons.get(error.severity, "?")
    code = error.code.value if hasattr(error.code, 'value') else str(error.code)
    message = f"[{icon}] {code}: {error.message}"

    if error.file_path:
        message += f"\n       File: {error.file_path}"

    if hasattr(error, 'context') and error.context:
        message += f"\n       Context: {error.context}"

    if error.suggestion:
        message += f"\n       Suggestion: {error.suggestion}"

    return message


def display_errors(errors: List[CampaignError], quiet: bool = False) -> None:
    """Display errors grouped by severity."""
    if not errors:
        return

    # Group by severity
    by_severity: dict[ErrorSeverity, list[CampaignError]] = defaultdict(list)
    for e in errors:
        by_severity[e.severity].append(e)

    # Display fatal first, then errors, then warnings
    for severity in [ErrorSeverity.FATAL, ErrorSeverity.ERROR, ErrorSeverity.WARNING]:
        if severity in by_severity:
            if severity == ErrorSeverity.WARNING and quiet:
                continue

            print(f"\n{severity.name}S ({len(by_severity[severity])}):")
            for e in by_severity[severity]:
                print(format_error(e))


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser."""
    parser = argparse.ArgumentParser(
        prog='campaign-builder',
        description='AI-powered simulation input deck generator for LAMMPS and Quantum ESPRESSO',
        epilog='''
Examples:
  %(prog)s analyze ./workspace
  %(prog)s generate ./workspace "equilibrate at 300K for 1ns"
  %(prog)s validate ./input.in --level all
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    # Global options
    parser.add_argument(
        '--verbose', '-v',
        action='count',
        default=0,
        help='Increase verbosity (can repeat: -vv, -vvv)'
    )
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress non-essential output'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )

    # Subcommands
    subparsers = parser.add_subparsers(dest='command', required=True)

    # analyze subcommand
    analyze_parser = subparsers.add_parser(
        'analyze',
        help='Analyze files in a workspace and generate File Guides',
        description='Analyze files in a workspace and generate File Guides.'
    )
    analyze_parser.add_argument(
        'workspace',
        type=str,
        help='Path to workspace directory containing simulation files'
    )
    analyze_parser.add_argument(
        '--include',
        action='append',
        dest='include_patterns',
        metavar='PATTERN',
        help='Include files matching pattern (can repeat)'
    )
    analyze_parser.add_argument(
        '--exclude',
        action='append',
        dest='exclude_patterns',
        metavar='PATTERN',
        help='Exclude files matching pattern (can repeat)'
    )
    analyze_parser.add_argument(
        '--max-concurrent',
        type=int,
        default=5,
        metavar='N',
        help='Maximum parallel analyses (default: 5)'
    )
    analyze_parser.add_argument(
        '--timeout',
        type=int,
        default=120,
        metavar='SECONDS',
        help='Timeout per file (default: 120)'
    )
    analyze_parser.add_argument(
        '--output', '-o',
        type=str,
        metavar='FILE',
        help='Save File Guides to JSON file'
    )

    # generate subcommand
    generate_parser = subparsers.add_parser(
        'generate',
        help='Generate simulation input decks from natural language intent',
        description='Generate simulation input decks from natural language intent.'
    )
    generate_parser.add_argument(
        'workspace',
        type=str,
        help='Path to workspace directory'
    )
    generate_parser.add_argument(
        'intent',
        type=str,
        help='Natural language description of simulation intent'
    )
    generate_parser.add_argument(
        '--output-dir', '-o',
        type=str,
        metavar='DIR',
        help='Output directory for generated files (default: workspace/output)'
    )
    generate_parser.add_argument(
        '--no-validate',
        action='store_true',
        help='Skip validation after generation'
    )
    generate_parser.add_argument(
        '--no-repair',
        action='store_true',
        help="Don't attempt to repair validation failures"
    )
    generate_parser.add_argument(
        '--max-repair-attempts',
        type=int,
        default=3,
        metavar='N',
        help='Maximum repair iterations (default: 3)'
    )
    generate_parser.add_argument(
        '--file-guides',
        type=str,
        metavar='FILE',
        help='Use pre-computed File Guides from JSON file'
    )

    # validate subcommand
    validate_parser = subparsers.add_parser(
        'validate',
        help='Validate a simulation input file',
        description='Validate a simulation input file.'
    )
    validate_parser.add_argument(
        'file',
        type=str,
        help='Path to input file to validate'
    )
    validate_parser.add_argument(
        '--level', '-l',
        type=str,
        default='all',
        help='Validation levels to run (L0,L1,L2,L3 or "all")'
    )
    validate_parser.add_argument(
        '--engine',
        type=str,
        choices=['lammps', 'qe', 'auto'],
        default='auto',
        help='Simulation engine (default: auto)'
    )
    validate_parser.add_argument(
        '--strict',
        action='store_true',
        help='Treat warnings as errors'
    )

    return parser


def parse_validation_levels(level_str: str) -> List[str]:
    """Parse validation level string into list of levels."""
    if level_str.lower() == 'all':
        return ['L0', 'L1', 'L2', 'L3']

    levels = []
    for part in level_str.upper().replace(' ', '').split(','):
        if part in ['L0', 'L1', 'L2', 'L3']:
            levels.append(part)
    return levels if levels else ['L0', 'L1', 'L2', 'L3']


async def run_analyze(args: argparse.Namespace) -> int:
    """Handle analyze subcommand."""
    workspace = Path(args.workspace).resolve()

    if not workspace.exists():
        print(f"Error: {workspace} does not exist", file=sys.stderr)
        return 1

    if not workspace.is_dir():
        print(f"Error: {workspace} is not a directory", file=sys.stderr)
        return 1

    try:
        from campaign_builder.agent.file_analyzer import (
            analyze_all_files,
            discover_files,
        )
    except ImportError as e:
        print(f"Error importing file analyzer: {e}", file=sys.stderr)
        print("Run 'pip install -e .' to install campaign-builder", file=sys.stderr)
        return 1

    # Discover files
    files = discover_files(
        workspace,
        include_patterns=args.include_patterns,
        exclude_patterns=args.exclude_patterns
    )

    if not files:
        if args.json:
            print(json.dumps({"total_files": 0, "file_guides": [], "errors": []}))
        else:
            print("No supported files found in workspace")
        return 0

    if not args.quiet:
        print(f"Found {len(files)} files to analyze")

    # Run analysis
    progress = ConsoleProgressReporter(quiet=args.quiet)

    result = await analyze_all_files(
        file_paths=files,
        max_iterations=15,
        max_concurrent=args.max_concurrent,
        timeout_per_file=args.timeout
    )

    # Output results
    if args.json:
        output = {
            "total_files": result.total_files,
            "successful": result.successful,
            "failed": result.failed,
            "file_guides": [fg.to_dict() for fg in result.file_guides],
            "errors": [
                {"code": e.code.value if hasattr(e.code, 'value') else str(e.code),
                 "message": e.message}
                for e in result.errors
            ],
            "duration_ms": result.total_duration_ms
        }
        print(json.dumps(output, indent=2))
    else:
        print(f"\nAnalysis complete:")
        print(f"  Files analyzed: {result.successful}/{result.total_files}")
        if result.failed > 0:
            print(f"  Failed: {result.failed}")
        print(f"  Duration: {result.total_duration_ms}ms")

        if result.file_guides:
            print("\nFile Guides:")
            for fg in result.file_guides:
                purpose = fg.purpose[:60] + "..." if len(fg.purpose) > 60 else fg.purpose
                print(f"  - {fg.file_name}: {purpose}")
                if fg.atom_count:
                    print(f"    Atoms: {fg.atom_count}")

        if result.errors:
            display_errors(result.errors, args.quiet)

    # Save File Guides if requested
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump([fg.to_dict() for fg in result.file_guides], f, indent=2)
        if not args.quiet:
            print(f"\nFile Guides saved to {output_path}")

    return 0 if result.failed == 0 else 1


async def run_generate(args: argparse.Namespace) -> int:
    """Handle generate subcommand."""
    workspace = Path(args.workspace).resolve()

    if not workspace.exists():
        print(f"Error: {workspace} does not exist", file=sys.stderr)
        return 1

    if not workspace.is_dir():
        print(f"Error: {workspace} is not a directory", file=sys.stderr)
        return 1

    # Validate intent
    if not args.intent or not args.intent.strip():
        print("Error: Intent cannot be empty", file=sys.stderr)
        return 3

    if len(args.intent.strip()) < 10:
        print("Warning: Intent is very short, results may be imprecise", file=sys.stderr)

    output_dir = Path(args.output_dir).resolve() if args.output_dir else workspace / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        from campaign_builder.agent.runner import run_campaign_builder
    except ImportError as e:
        print(f"Error importing runner: {e}", file=sys.stderr)
        print("Run 'pip install -e .' to install campaign-builder", file=sys.stderr)
        return 1

    # Check for pre-computed file guides
    file_guides = None
    if args.file_guides:
        guides_path = Path(args.file_guides)
        if not guides_path.exists():
            print(f"Error: File guides file not found: {guides_path}", file=sys.stderr)
            return 1

        from campaign_builder.schemas.file_guide import FileGuide
        with open(guides_path) as f:
            guides_data = json.load(f)
        file_guides = [FileGuide.from_dict(g) for g in guides_data]

    progress = ConsoleProgressReporter(quiet=args.quiet)

    # Run campaign builder
    result = await run_campaign_builder(
        intent=args.intent,
        workspace=workspace,
        output_dir=output_dir,
        progress_callback=progress
    )

    # Output results
    if args.json:
        output: dict[str, Any] = {
            "success": result.success,
            "intent": result.intent,
            "files_found": result.files_found,
            "files_analyzed": result.files_analyzed,
            "generated_files": [
                {
                    "path": str(gf.path),
                    "purpose": gf.purpose,
                    "engine": gf.engine,
                    "validation_passed": gf.validation.overall_passed if gf.validation else None
                }
                for gf in result.generated_files
            ] if result.generated_files else [],
            "output_directory": str(result.output_directory),
            "duration_ms": result.total_duration_ms,
            "errors": [
                {"code": e.code.value if hasattr(e.code, 'value') else str(e.code),
                 "message": e.message}
                for e in result.errors
            ],
            "warnings": result.warnings,
            "assumptions": result.assumptions
        }
        print(json.dumps(output, indent=2))
    else:
        print("\n" + "=" * 60)
        status = "SUCCESS" if result.success else "FAILED"
        print(f"CAMPAIGN BUILDER - {status}")
        print("=" * 60)

        print(f"\nIntent: {args.intent}")
        print(f"Workspace: {workspace}")
        print(f"Output: {output_dir}")

        print(f"\nAnalysis:")
        print(f"  Files found: {result.files_found}")
        print(f"  Files analyzed: {result.files_analyzed}")

        if result.generated_files:
            print(f"\nGenerated Files:")
            for gf in result.generated_files:
                status_str = "VALID" if (gf.validation and gf.validation.overall_passed) else "FAILED"
                print(f"  - {gf.path.name}: {status_str}")
                print(f"    Purpose: {gf.purpose}")

        if result.campaign_plan:
            print(f"\nCampaign Plan:")
            for line in result.campaign_plan.split('\n')[:10]:
                print(f"  {line}")
            if result.campaign_plan.count('\n') > 10:
                print("  ...")

        if result.assumptions:
            print("\nAssumptions:")
            for a in result.assumptions[:5]:
                print(f"  - {a}")

        if result.warnings:
            print("\nWarnings:")
            for w in result.warnings[:5]:
                print(f"  - {w}")

        if result.errors:
            display_errors(result.errors, args.quiet)

        print(f"\nDuration: {result.total_duration_ms}ms")
        print(f"  Analysis: {result.analysis_duration_ms}ms")
        print(f"  Planning: {result.planning_duration_ms}ms")

        if result.readme_path:
            print(f"\nREADME: {result.readme_path}")

    if result.success:
        return 0
    elif result.generated_files:
        return 2  # Partial success
    else:
        return 1


async def run_validate(args: argparse.Namespace) -> int:
    """Handle validate subcommand."""
    file_path = Path(args.file).resolve()

    if not file_path.exists():
        print(f"Error: {file_path} does not exist", file=sys.stderr)
        return 1

    if not file_path.is_file():
        print(f"Error: {file_path} is not a file", file=sys.stderr)
        return 1

    try:
        from campaign_builder.tools.validation import validate_deck
    except ImportError as e:
        print(f"Error importing validation tools: {e}", file=sys.stderr)
        return 1

    levels = parse_validation_levels(args.level)

    # Auto-detect engine if needed
    engine = args.engine
    if engine == 'auto':
        suffix = file_path.suffix.lower()
        name = file_path.name.lower()
        if suffix in ['.pwi', '.pwo'] or '&control' in file_path.read_text().lower():
            engine = 'qe'
        else:
            engine = 'lammps'

    # Run validation
    result = validate_deck(file_path, engine)

    # Output results
    if args.json:
        output: dict[str, Any] = {
            "file": str(file_path),
            "engine": engine,
            "overall_passed": result.overall_passed,
            "l0": {
                "passed": result.l0.passed if result.l0 else None,
                "placeholders": result.l0.placeholders if result.l0 else []
            },
            "l1": {
                "passed": result.l1.passed if result.l1 else None,
                "errors": [str(e) for e in (result.l1.errors if result.l1 else [])]
            },
            "l2": {
                "passed": result.l2.passed if result.l2 else None,
                "skipped": result.l2.skipped if result.l2 else False,
                "skip_reason": result.l2.skip_reason if result.l2 else None
            } if result.l2 else None,
            "l3": {
                "passed": result.l3.passed if result.l3 else None,
                "warnings": result.l3.warnings if result.l3 else []
            } if result.l3 else None
        }
        print(json.dumps(output, indent=2))
    else:
        print(f"\nValidation Results for {file_path.name}")
        print("-" * 40)
        print(f"Engine: {engine}")
        print()

        # L0
        if result.l0:
            status = "PASSED" if result.l0.passed else "FAILED"
            print(f"L0 (Template Completeness): {status}")
            if not result.l0.passed and result.l0.placeholders:
                for ph in result.l0.placeholders[:5]:
                    print(f"  - Found placeholder: {ph}")

        # L1
        if result.l1:
            status = "PASSED" if result.l1.passed else "FAILED"
            print(f"L1 (Syntax Validation): {status}")
            if not result.l1.passed and result.l1.errors:
                for err in result.l1.errors[:5]:
                    print(f"  - {err}")

        # L2
        if result.l2:
            if not result.l2.skipped:
                status = "PASSED" if result.l2.passed else "FAILED"
                print(f"L2 (Engine Acceptance): {status}")
                if not result.l2.passed and result.l2.engine_output:
                    for line in result.l2.engine_output.split('\n')[:3]:
                        print(f"  - {line}")
            else:
                reason = result.l2.skip_reason or "engine not available"
                print(f"L2 (Engine Acceptance): SKIPPED ({reason})")

        # L3
        if result.l3:
            status = "PASSED" if result.l3.passed else "WARNINGS"
            print(f"L3 (Physics Sanity): {status}")
            if result.l3.warnings:
                for w in result.l3.warnings[:5]:
                    print(f"  - {w}")

        print()
        overall = "PASSED" if result.overall_passed else "FAILED"
        print(f"Overall: {overall}")

    # Determine exit code
    if result.overall_passed:
        return 0
    elif args.strict and (result.l3 and result.l3.warnings):
        return 1
    elif not result.l0 or not result.l0.passed or not result.l1 or not result.l1.passed:
        return 1
    else:
        return 0


async def main() -> int:
    """Main async entry point for the Campaign Builder CLI."""
    parser = create_parser()
    args = parser.parse_args()

    # Configure logging
    configure_logging(args.verbose, args.quiet)

    # Handle Ctrl+C gracefully
    def handle_interrupt(signum: int, frame: Any) -> None:
        print("\nInterrupted by user")
        sys.exit(130)

    signal.signal(signal.SIGINT, handle_interrupt)

    try:
        if args.command == 'analyze':
            return await run_analyze(args)
        elif args.command == 'generate':
            return await run_generate(args)
        elif args.command == 'validate':
            return await run_validate(args)
        else:
            parser.print_help()
            return 0
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        return 130
    except Exception as e:
        logger.exception("Unexpected error")
        print(f"Error: {e}", file=sys.stderr)
        return 1


def main_sync() -> int:
    """
    Synchronous wrapper for the main async entry point.

    This is the entry point used by the console script defined in pyproject.toml.
    """
    # Handle Windows event loop
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    return asyncio.run(main())


if __name__ == "__main__":
    sys.exit(main_sync())
