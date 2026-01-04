# CLI Implementation

This file contains Thrust 17: Command-Line Interface implementation.

---

## Thrust 17: CLI Implementation

### 17.1 Objective

Implement a user-friendly command-line interface that exposes Campaign Builder functionality with proper argument handling, progress feedback, and structured output.

### 17.2 Background

The CLI is the primary user interface for Campaign Builder. It must:
- Accept workspace paths and intent strings
- Show progress during analysis and generation
- Output results in both human-readable and machine-readable formats
- Handle errors gracefully with actionable messages
- Support configuration via command-line flags

### 17.3 Subtasks

#### 17.3.1 Create CLI Entry Point

In `campaign_builder/cli.py`:

**Main function structure:**

```
Main Entry Point: campaign_builder/cli.py
├── main() - Entry point called by __main__.py
├── create_parser() - Build argument parser
├── run_analyze() - Handle analyze subcommand
├── run_generate() - Handle generate subcommand
├── run_validate() - Handle validate subcommand
└── format_output() - Format results for display
```

**Create the argparse setup:**

1. **Program description:**
   - Name: campaign-builder
   - Description: "AI-powered simulation input deck generator"
   - Epilog: Usage examples

2. **Global options:**
   - `--verbose, -v`: Increase verbosity (can repeat: -vv, -vvv)
   - `--quiet, -q`: Suppress non-essential output
   - `--json`: Output results as JSON
   - `--config`: Path to config file
   - `--version`: Show version and exit

#### 17.3.2 Define Subcommands

**analyze subcommand:**
```
campaign-builder analyze <workspace> [options]
```

Arguments:
- `workspace`: Path to workspace directory (required, positional)

Options:
- `--include`: Glob patterns to include (can repeat)
- `--exclude`: Glob patterns to exclude (can repeat)
- `--max-concurrent`: Maximum parallel file analyses (default: 5)
- `--timeout`: Timeout per file in seconds (default: 120)
- `--output, -o`: Output file for File Guides JSON
- `--no-cache`: Skip file hash caching

**generate subcommand:**
```
campaign-builder generate <workspace> <intent> [options]
```

Arguments:
- `workspace`: Path to workspace directory (required)
- `intent`: Natural language intent string (required)

Options:
- `--output-dir, -o`: Output directory for generated files (default: workspace/output)
- `--validate`: Run validation after generation (default: true)
- `--repair`: Attempt to repair validation failures (default: true)
- `--max-repair-attempts`: Maximum repair iterations (default: 3)
- `--file-guides`: Path to pre-computed File Guides JSON

**validate subcommand:**
```
campaign-builder validate <file> [options]
```

Arguments:
- `file`: Path to input file to validate (required)

Options:
- `--level, -l`: Validation levels to run (L0,L1,L2,L3 or "all")
- `--engine`: Simulation engine (lammps, qe, auto)
- `--strict`: Treat warnings as errors

#### 17.3.3 Implement Argument Parsing

In `create_parser()`:

```python
def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='campaign-builder',
        description='AI-powered simulation input deck generator',
        epilog='''
Examples:
  %(prog)s analyze ./workspace
  %(prog)s generate ./workspace "equilibrate at 300K for 1ns"
  %(prog)s validate ./input.in --level all
        '''
    )

    # Global options
    parser.add_argument('--verbose', '-v', action='count', default=0)
    parser.add_argument('--quiet', '-q', action='store_true')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--version', action='version', version='%(prog)s 0.1.0')

    # Subcommands
    subparsers = parser.add_subparsers(dest='command', required=True)

    # ... add each subcommand

    return parser
```

**Argument validation logic:**

1. **Workspace validation:**
   - Check path exists
   - Check is directory
   - Check readable
   - If not valid: exit with error code 1 and message

2. **Intent validation:**
   - Check not empty
   - Check not just whitespace
   - Warn if very short (< 10 chars)

3. **Output directory:**
   - Create if doesn't exist
   - Check writable

#### 17.3.4 Implement Progress Display

Create progress reporting for long-running operations:

**Progress callback interface:**
```python
from typing import Protocol

class ProgressReporter(Protocol):
    def start(self, total: int, description: str) -> None: ...
    def update(self, current: int, message: str) -> None: ...
    def finish(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...
```

**Console progress implementation:**
```python
class ConsoleProgressReporter:
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
```

**Rich progress bar (optional enhancement):**
```python
# If rich is available, use rich.progress
try:
    from rich.progress import Progress, SpinnerColumn, TextColumn
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

class RichProgressReporter:
    # Implementation using rich library for nicer output
    pass
```

#### 17.3.5 Implement run_analyze

**Flow:**

1. **Parse workspace path:**
   ```python
   workspace = Path(args.workspace).resolve()
   if not workspace.is_dir():
       print(f"Error: {workspace} is not a directory", file=sys.stderr)
       return 1
   ```

2. **Discover files:**
   ```python
   from campaign_builder.agent import discover_files

   files = discover_files(
       workspace,
       include_patterns=args.include,
       exclude_patterns=args.exclude
   )

   if not files:
       print("No supported files found in workspace")
       return 0
   ```

3. **Run analysis:**
   ```python
   from campaign_builder.agent import analyze_all_files

   progress = ConsoleProgressReporter(quiet=args.quiet)

   result = await analyze_all_files(
       file_paths=files,
       max_concurrent=args.max_concurrent,
       timeout_per_file=args.timeout,
       progress_callback=progress.update
   )
   ```

4. **Output results:**
   ```python
   if args.json:
       output = {
           "total_files": result.total_files,
           "successful": result.successful,
           "failed": result.failed,
           "file_guides": [fg.to_dict() for fg in result.file_guides],
           "errors": [e.to_dict() for e in result.errors]
       }
       print(json.dumps(output, indent=2))
   else:
       print(f"\nAnalysis complete:")
       print(f"  Files analyzed: {result.successful}/{result.total_files}")
       if result.failed > 0:
           print(f"  Failed: {result.failed}")

       for fg in result.file_guides:
           print(f"  - {fg.file_name}: {fg.purpose}")
   ```

5. **Save File Guides if requested:**
   ```python
   if args.output:
       output_path = Path(args.output)
       with open(output_path, 'w') as f:
           json.dump([fg.to_dict() for fg in result.file_guides], f, indent=2)
       print(f"File Guides saved to {output_path}")
   ```

6. **Return exit code:**
   ```python
   return 0 if result.failed == 0 else 1
   ```

#### 17.3.6 Implement run_generate

**Flow:**

1. **Load or compute File Guides:**
   ```python
   if args.file_guides:
       # Load pre-computed
       with open(args.file_guides) as f:
           guides_data = json.load(f)
       file_guides = [FileGuide.from_dict(g) for g in guides_data]
   else:
       # Analyze workspace
       result = await analyze_workspace(workspace)
       file_guides = result.file_guides
   ```

2. **Run Campaign Planner:**
   ```python
   from campaign_builder.agent import plan_campaign

   campaign_result = await plan_campaign(
       file_guides=file_guides,
       user_intent=args.intent,
       output_dir=args.output_dir,
       validate=args.validate,
       repair=args.repair,
       max_repair_attempts=args.max_repair_attempts
   )
   ```

3. **Display campaign plan:**
   ```python
   if args.json:
       print(json.dumps(campaign_result.to_dict(), indent=2))
   else:
       print("\n" + "="*60)
       print("CAMPAIGN PLAN")
       print("="*60)
       print(f"\nIntent: {args.intent}")
       print(f"\nFiles Generated:")
       for f in campaign_result.generated_files:
           status = "VALID" if f.validation_passed else "FAILED"
           print(f"  - {f.filename}: {status}")

       if campaign_result.warnings:
           print("\nWarnings:")
           for w in campaign_result.warnings:
               print(f"  - {w}")
   ```

4. **Return exit code:**
   ```python
   if campaign_result.success:
       return 0
   elif campaign_result.partial_success:
       return 2  # Partial success
   else:
       return 1  # Failure
   ```

#### 17.3.7 Implement run_validate

**Flow:**

1. **Parse file and options:**
   ```python
   file_path = Path(args.file).resolve()
   if not file_path.is_file():
       print(f"Error: {file_path} is not a file", file=sys.stderr)
       return 1

   levels = parse_validation_levels(args.level)
   ```

2. **Run validation:**
   ```python
   from campaign_builder.tools import validate_deck

   result = await validate_deck(
       file_path=file_path,
       levels=levels,
       engine=args.engine
   )
   ```

3. **Display results:**
   ```python
   if args.json:
       print(json.dumps(result.to_dict(), indent=2))
   else:
       print(f"\nValidation Results for {file_path.name}")
       print("-" * 40)

       for level_result in result.levels:
           status = "PASSED" if level_result.passed else "FAILED"
           print(f"L{level_result.level}: {status}")

           for check in level_result.checks:
               icon = "OK" if check.passed else "X"
               print(f"  [{icon}] {check.name}")
               if not check.passed:
                   print(f"       {check.message}")

       if result.warnings and not args.quiet:
           print("\nWarnings:")
           for w in result.warnings:
               print(f"  - {w}")
   ```

4. **Return exit code:**
   ```python
   if result.all_passed:
       return 0
   elif args.strict and result.has_warnings:
       return 1
   elif result.has_errors:
       return 1
   else:
       return 0
   ```

#### 17.3.8 Implement Error Display

Create user-friendly error messages:

```python
def format_error(error: CampaignError) -> str:
    """Format error for CLI display."""
    severity_icons = {
        ErrorSeverity.INFO: "INFO",
        ErrorSeverity.WARNING: "WARN",
        ErrorSeverity.ERROR: "ERR",
        ErrorSeverity.FATAL: "FATAL"
    }

    icon = severity_icons.get(error.severity, "?")

    message = f"[{icon}] {error.code.value}: {error.message}"

    if error.file_path:
        message += f"\n       File: {error.file_path}"

    if error.context:
        message += f"\n       Context: {error.context}"

    if error.suggestion:
        message += f"\n       Suggestion: {error.suggestion}"

    return message
```

**Error summary display:**
```python
def display_errors(errors: List[CampaignError], quiet: bool = False) -> None:
    """Display errors grouped by severity."""
    if not errors:
        return

    # Group by severity
    by_severity = defaultdict(list)
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
```

#### 17.3.9 Implement Logging Configuration

**Set up logging based on verbosity:**

```python
import logging

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

    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S'
    )

    # Quiet noisy libraries
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
```

#### 17.3.10 Create __main__.py Entry Point

In `campaign_builder/__main__.py`:

```python
"""Campaign Builder CLI entry point."""
import sys
import asyncio
from campaign_builder.cli import main

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
```

**This enables:**
```bash
python -m campaign_builder analyze ./workspace
```

#### 17.3.11 Create Console Script Entry

In `pyproject.toml`, add:

```toml
[project.scripts]
campaign-builder = "campaign_builder.cli:main_sync"
```

**Create sync wrapper:**
```python
def main_sync() -> int:
    """Synchronous wrapper for console script entry point."""
    return asyncio.run(main())
```

**This enables:**
```bash
campaign-builder analyze ./workspace
```

#### 17.3.12 Implement Help Text

Create comprehensive help text:

**analyze help:**
```
usage: campaign-builder analyze [-h] [--include PATTERN] [--exclude PATTERN]
                                [--max-concurrent N] [--timeout SECONDS]
                                [--output FILE]
                                workspace

Analyze files in a workspace and generate File Guides.

positional arguments:
  workspace             Path to workspace directory containing simulation files

options:
  -h, --help            show this help message and exit
  --include PATTERN     Include files matching pattern (can repeat)
  --exclude PATTERN     Exclude files matching pattern (can repeat)
  --max-concurrent N    Maximum parallel analyses (default: 5)
  --timeout SECONDS     Timeout per file (default: 120)
  --output FILE, -o FILE
                        Save File Guides to JSON file

Supported file types:
  - LAMMPS: .data, .lmp, .in
  - QE: .pwi, .pwo
  - Structure: POSCAR, .cif, .xyz, .pdb
  - Documents: .pdf, .xlsx, .csv
```

**generate help:**
```
usage: campaign-builder generate [-h] [--output-dir DIR] [--no-validate]
                                 [--no-repair] [--max-repair-attempts N]
                                 [--file-guides FILE]
                                 workspace intent

Generate simulation input decks from natural language intent.

positional arguments:
  workspace             Path to workspace directory
  intent                Natural language description of simulation intent

options:
  -h, --help            show this help message and exit
  --output-dir DIR, -o DIR
                        Output directory for generated files (default: workspace/output)
  --no-validate         Skip validation after generation
  --no-repair           Don't attempt to repair validation failures
  --max-repair-attempts N
                        Maximum repair iterations (default: 3)
  --file-guides FILE    Use pre-computed File Guides from JSON file

Examples:
  campaign-builder generate ./mof "equilibrate at 300K using NVT"
  campaign-builder generate ./polymer "run 1ns NPT at 1atm, 298K"
```

### 17.4 Exit Codes

Define standard exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (validation failed, missing files) |
| 2 | Partial success (some files failed) |
| 3 | Configuration error (invalid arguments) |
| 4 | Missing dependency (engine not found) |
| 130 | Interrupted (Ctrl+C) |

### 17.5 Verification Steps

1. **Argument parsing:**
   - [ ] All subcommands recognized
   - [ ] Required arguments enforced
   - [ ] Optional arguments have defaults
   - [ ] Help text displays correctly

2. **Analyze subcommand:**
   - [ ] Discovers files in workspace
   - [ ] Shows progress during analysis
   - [ ] Outputs File Guides summary
   - [ ] JSON output works
   - [ ] Exit codes correct

3. **Generate subcommand:**
   - [ ] Accepts intent string
   - [ ] Runs analysis if needed
   - [ ] Generates input files
   - [ ] Validates generated files
   - [ ] Shows campaign plan

4. **Validate subcommand:**
   - [ ] Runs requested levels
   - [ ] Displays clear results
   - [ ] Strict mode works
   - [ ] Exit codes correct

5. **Error handling:**
   - [ ] Invalid paths handled
   - [ ] Missing files reported
   - [ ] Timeouts handled gracefully
   - [ ] Ctrl+C handled cleanly

6. **Output formatting:**
   - [ ] Human-readable output clear
   - [ ] JSON output valid
   - [ ] Quiet mode suppresses noise
   - [ ] Verbose mode shows details

### 17.6 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/cli.py` | Create | Main CLI implementation |
| `campaign_builder/__main__.py` | Create | Entry point |
| `pyproject.toml` | Modified | Add console script |

---

## Usage Examples

### Basic Analysis
```bash
# Analyze all files in workspace
campaign-builder analyze ./my_simulation

# Analyze with specific patterns
campaign-builder analyze ./workspace --include "*.data" --include "*.in"

# Save File Guides for later use
campaign-builder analyze ./workspace -o file_guides.json
```

### Generation
```bash
# Generate from intent
campaign-builder generate ./mof_system "equilibrate at 300K for 1ns"

# Use pre-computed File Guides
campaign-builder generate ./mof_system "run NVT" --file-guides guides.json

# Output to specific directory
campaign-builder generate ./workspace "minimize then equilibrate" -o ./output
```

### Validation
```bash
# Validate a single file
campaign-builder validate input.in

# Run all levels
campaign-builder validate input.in --level all

# Strict mode
campaign-builder validate input.in --strict
```

### JSON Output
```bash
# Get machine-readable output
campaign-builder analyze ./workspace --json > analysis.json
campaign-builder generate ./workspace "intent" --json > result.json
```

### Verbosity
```bash
# Quiet mode (errors only)
campaign-builder analyze ./workspace -q

# Verbose mode
campaign-builder analyze ./workspace -v

# Debug mode
campaign-builder analyze ./workspace -vvv
```

---

## Implementation Notes

### Async Handling

The CLI wraps async operations for synchronous entry points:

```python
def main_sync() -> int:
    """Entry point for console script."""
    import asyncio

    # Handle Windows event loop
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    return asyncio.run(main())
```

### Signal Handling

Handle Ctrl+C gracefully:

```python
import signal

def handle_interrupt(signum, frame):
    print("\nInterrupted by user")
    sys.exit(130)

signal.signal(signal.SIGINT, handle_interrupt)
```

### Next Thrust

After completing Thrust 17, proceed to [11-testing.md](./11-testing.md) for testing and integration.
