# Orchestration Runner

This file contains Thrusts 15-16: Main pipeline orchestration and error handling.

---

## Thrust 15: Orchestration Runner Implementation

### 15.1 Objective

Implement the main orchestration function that coordinates the entire Campaign Builder pipeline from user input to validated output.

### 15.2 Background

The orchestration runner is the top-level coordinator that:
- Discovers files in workspace
- Computes provenance hashes
- Spawns FileAnalyzers in parallel
- Collects File Guides
- Invokes Campaign Planner
- Compiles final results
- Handles errors throughout

### 15.3 Subtasks

#### 15.3.1 Define CampaignBuilderResult

In `campaign_builder/agent/runner.py`:

```python
@dataclass
class CampaignBuilderResult:
    success: bool

    # Input summary
    intent: str
    workspace: Path
    files_found: int
    files_analyzed: int

    # Analysis results
    file_guides: List[FileGuide]
    analysis_errors: List[CampaignError]

    # Campaign results
    campaign_plan: Optional[str]
    generated_files: List[GeneratedFile]
    parameter_manifest: Dict[str, ParameterSource]

    # Output artifacts
    output_directory: Path
    validation_summary: str
    readme_path: Optional[Path]
    manifest_path: Optional[Path]

    # Metadata
    total_duration_ms: int
    analysis_duration_ms: int
    planning_duration_ms: int

    # Issues
    errors: List[CampaignError]
    warnings: List[str]
    assumptions: List[str]
```

#### 15.3.2 Implement run_campaign_builder Function

```python
async def run_campaign_builder(
    intent: str,
    workspace: Union[str, Path],
    output_dir: Optional[Union[str, Path]] = None,
    max_file_iterations: int = 15,
    max_plan_iterations: int = 10,
    max_concurrent_files: int = 5,
    progress_callback: Optional[Callable] = None
) -> CampaignBuilderResult
```

**Implementation outline:**

```python
async def run_campaign_builder(...) -> CampaignBuilderResult:
    start_time = time.time()

    # 1. Setup
    workspace = Path(workspace).resolve()
    output_dir = Path(output_dir).resolve() if output_dir else workspace / "campaign_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    error_handler = ErrorHandler()
    file_guides = []
    campaign_result = None

    # 2. Discover files
    if progress_callback:
        progress_callback("discovering", 0, "Discovering files...")

    files = discover_files(workspace)

    if not files:
        error_handler.add(CampaignError(
            code=ErrorCode.E402,
            severity=ErrorSeverity.FATAL,
            message="No supported files found in workspace"
        ))
        return create_failed_result(error_handler, ...)

    # 3. Compute file hashes
    file_hashes = {}
    for f in files:
        file_hashes[str(f)] = compute_file_hash(f)

    # 4. Analyze files in parallel
    if progress_callback:
        progress_callback("analyzing", 0, f"Analyzing {len(files)} files...")

    analysis_start = time.time()
    batch_result = await analyze_all_files(
        file_paths=files,
        max_iterations=max_file_iterations,
        max_concurrent=max_concurrent_files,
        progress_callback=lambda i, t, f: progress_callback("analyzing", i/t, f) if progress_callback else None
    )
    analysis_duration = int((time.time() - analysis_start) * 1000)

    file_guides = batch_result.file_guides
    for err in batch_result.errors:
        error_handler.add(err)

    if not file_guides:
        error_handler.add(CampaignError(
            code=ErrorCode.E406,
            severity=ErrorSeverity.FATAL,
            message="No files could be analyzed successfully"
        ))
        return create_failed_result(error_handler, ...)

    # 5. Run Campaign Planner
    if progress_callback:
        progress_callback("planning", 0, "Planning campaign...")

    planning_start = time.time()
    try:
        campaign_result = await run_campaign_planner(
            intent=intent,
            file_guides=file_guides,
            workspace=workspace,
            output_dir=output_dir,
            max_iterations=max_plan_iterations
        )
    except Exception as e:
        error_handler.add(CampaignError(
            code=ErrorCode.E501,
            severity=ErrorSeverity.FATAL,
            message=f"Campaign planning failed: {str(e)}"
        ))
        return create_failed_result(error_handler, ...)

    planning_duration = int((time.time() - planning_start) * 1000)

    for err in campaign_result.errors:
        error_handler.add(err)

    # 6. Write artifacts
    if progress_callback:
        progress_callback("finalizing", 0.5, "Writing artifacts...")

    readme_path = write_campaign_readme(output_dir, intent, campaign_result)
    manifest_path = write_parameter_manifest(output_dir, campaign_result)

    # 7. Compile final result
    total_duration = int((time.time() - start_time) * 1000)

    return CampaignBuilderResult(
        success=campaign_result.success and not error_handler.has_fatal(),
        intent=intent,
        workspace=workspace,
        files_found=len(files),
        files_analyzed=len(file_guides),
        file_guides=file_guides,
        analysis_errors=batch_result.errors,
        campaign_plan=campaign_result.campaign_plan,
        generated_files=campaign_result.generated_files,
        parameter_manifest=campaign_result.parameter_manifest,
        output_directory=output_dir,
        validation_summary=create_validation_summary(campaign_result.generated_files),
        readme_path=readme_path,
        manifest_path=manifest_path,
        total_duration_ms=total_duration,
        analysis_duration_ms=analysis_duration,
        planning_duration_ms=planning_duration,
        errors=error_handler.get_errors(),
        warnings=campaign_result.warnings + [str(e) for e in error_handler.get_warnings()],
        assumptions=campaign_result.assumptions
    )
```

#### 15.3.3 Implement Artifact Writers

**Write Campaign README:**

```python
def write_campaign_readme(
    output_dir: Path,
    intent: str,
    result: CampaignPlanResult
) -> Path:
    readme_path = output_dir / "README.md"

    content = f"""# Campaign Builder Output

## Intent

{intent}

## Campaign Plan

{result.campaign_plan}

## Generated Files

| File | Purpose | Validation |
|------|---------|------------|
"""
    for gf in result.generated_files:
        status = "PASSED" if gf.validation.overall_passed else "FAILED"
        content += f"| {gf.path.name} | {gf.purpose} | {status} |\n"

    content += f"""

## Assumptions Made

"""
    for a in result.assumptions:
        content += f"- {a}\n"

    if result.warnings:
        content += """

## Warnings

"""
        for w in result.warnings:
            content += f"- {w}\n"

    content += """

---
*Generated by Campaign Builder*
"""

    readme_path.write_text(content)
    return readme_path
```

**Write Parameter Manifest:**

```python
def write_parameter_manifest(
    output_dir: Path,
    result: CampaignPlanResult
) -> Path:
    manifest_path = output_dir / "manifest.json"

    manifest = {
        "parameters": {},
        "sources": {},
        "defaults": {}
    }

    for param, source in result.parameter_manifest.items():
        manifest["parameters"][param] = source.value
        if source.is_default:
            manifest["defaults"][param] = source.default_reason
        else:
            manifest["sources"][param] = {
                "file": source.source_file,
                "location": source.source_location
            }

    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest_path
```

#### 15.3.4 Implement Progress Callback Protocol

```python
# Progress callback signature:
# callback(stage: str, progress: float, message: str)
#
# Stages:
#   "discovering" - Finding files
#   "analyzing"   - Analyzing files (progress = files_done / total)
#   "planning"    - Running Campaign Planner
#   "validating"  - Validating generated files
#   "finalizing"  - Writing artifacts
#   "complete"    - Done
```

#### 15.3.5 Implement Failed Result Creator

```python
def create_failed_result(
    error_handler: ErrorHandler,
    workspace: Path,
    intent: str,
    files_found: int = 0,
    file_guides: Optional[List[FileGuide]] = None,
    duration_ms: int = 0
) -> CampaignBuilderResult:
    return CampaignBuilderResult(
        success=False,
        intent=intent,
        workspace=workspace,
        files_found=files_found,
        files_analyzed=len(file_guides) if file_guides else 0,
        file_guides=file_guides or [],
        analysis_errors=[],
        campaign_plan=None,
        generated_files=[],
        parameter_manifest={},
        output_directory=workspace,
        validation_summary="",
        readme_path=None,
        manifest_path=None,
        total_duration_ms=duration_ms,
        analysis_duration_ms=0,
        planning_duration_ms=0,
        errors=error_handler.get_errors(),
        warnings=[str(e) for e in error_handler.get_warnings()],
        assumptions=[]
    )
```

#### 15.3.6 Update Module Exports

```python
# campaign_builder/agent/__init__.py
from .runner import (
    run_campaign_builder,
    CampaignBuilderResult
)
```

### 15.4 Verification Steps

1. **Pipeline execution:**
   - [ ] Files discovered correctly
   - [ ] Analysis runs in parallel
   - [ ] Planning receives File Guides
   - [ ] Artifacts written correctly

2. **Progress reporting:**
   - [ ] Callback invoked for each stage
   - [ ] Progress values accurate

3. **Duration tracking:**
   - [ ] Total duration correct
   - [ ] Phase durations tracked

4. **Result completeness:**
   - [ ] All fields populated
   - [ ] Generated files listed
   - [ ] Errors collected

### 15.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/runner.py` | Modified | Add run_campaign_builder |
| `campaign_builder/agent/__init__.py` | Modified | Export runner |
| `tests/test_runner.py` | Modified | Add integration tests |

---

## Thrust 16: Error Handling and Graceful Degradation

### 16.1 Objective

Implement comprehensive error handling that enables graceful degradation when parts of the pipeline fail.

### 16.2 Background

Campaign Builder should:
- Continue with available information when possible
- Clearly report what failed and why
- Never silently skip important steps
- Provide actionable suggestions

### 16.3 Subtasks

#### 16.3.1 Implement ErrorHandler Class

In `campaign_builder/schemas/errors.py`:

```python
class ErrorHandler:
    def __init__(self):
        self._errors: List[CampaignError] = []
        self._warnings: List[CampaignError] = []
        self._info: List[CampaignError] = []

    def add(self, error: CampaignError) -> None:
        if error.severity == ErrorSeverity.FATAL:
            self._errors.append(error)
        elif error.severity == ErrorSeverity.ERROR:
            self._errors.append(error)
        elif error.severity == ErrorSeverity.WARNING:
            self._warnings.append(error)
        else:
            self._info.append(error)

    def has_fatal(self) -> bool:
        return any(e.severity == ErrorSeverity.FATAL for e in self._errors)

    def has_errors(self) -> bool:
        return len(self._errors) > 0

    def can_continue(self) -> bool:
        return not self.has_fatal()

    def get_errors(self) -> List[CampaignError]:
        return self._errors.copy()

    def get_warnings(self) -> List[CampaignError]:
        return self._warnings.copy()

    def get_all(self) -> List[CampaignError]:
        return self._errors + self._warnings + self._info

    def get_report(self) -> str:
        lines = []

        if self._errors:
            lines.append("## Errors")
            for e in self._errors:
                lines.append(f"- [{e.code}] {e.message}")
                if e.suggestion:
                    lines.append(f"  Suggestion: {e.suggestion}")

        if self._warnings:
            lines.append("## Warnings")
            for w in self._warnings:
                lines.append(f"- [{w.code}] {w.message}")

        return "\n".join(lines)

    def clear(self) -> None:
        self._errors.clear()
        self._warnings.clear()
        self._info.clear()
```

#### 16.3.2 Implement Graceful Degradation Strategy

**At each pipeline stage:**

```python
# File Discovery
if not files:
    # FATAL: Cannot continue without files
    raise CampaignError(E402, FATAL, "No files found")

# File Analysis
if all_files_failed:
    # FATAL: Cannot continue without any data
    raise CampaignError(E406, FATAL, "No files analyzed")
elif some_files_failed:
    # WARNING: Continue with available data
    log.warning(f"{failed_count} files failed, continuing with {success_count}")
    # Add warnings to result

# Campaign Planning
if missing_force_field:
    # FATAL: Cannot generate valid deck
    raise CampaignError(E401, FATAL, "Missing force field parameters")
elif missing_optional:
    # WARNING: Continue with defaults
    log.warning("Using defaults for: ...")

# Validation
if l0_l1_failed:
    # ERROR: Try repair
    attempt_repair()
elif l2_failed:
    # WARNING if engine issue, ERROR if input issue
    determine_cause_and_handle()
elif l3_warnings:
    # INFO: Report but continue
    result.warnings.extend(l3_warnings)
```

#### 16.3.3 Create Error Recovery Suggestions

```python
def get_recovery_suggestion(error: CampaignError) -> str:
    suggestions = {
        "E101": "Check that the file path is correct and the file exists",
        "E102": "The file is too large. Try splitting it or extracting relevant sections",
        "E103": "Check file permissions and ensure it's not locked by another process",
        "E201": "The file may be too complex. Try simplifying or providing a smaller sample",
        "E206": "Provide a force field file (e.g., .prm, .frcmod, or parameter section in .data)",
        "E301": "The generated file contains placeholder text. Check if required information was provided",
        "E310": "Reduce the pair_style cutoff or use a larger simulation box",
        "E401": "Provide a file containing force field parameters (epsilon, sigma values)",
        "E402": "Provide a structure file (.data, POSCAR, .cif, etc.)",
    }
    return suggestions.get(error.code, "No specific suggestion available")
```

#### 16.3.4 Implement Partial Success Reporting

```python
def create_partial_success_report(
    result: CampaignBuilderResult
) -> str:
    lines = ["# Campaign Builder Report", ""]

    # Overall status
    if result.success:
        lines.append("## Status: SUCCESS")
    else:
        lines.append("## Status: PARTIAL SUCCESS" if result.generated_files else "## Status: FAILED")

    # What worked
    lines.append("")
    lines.append("## Completed Successfully")
    lines.append(f"- Files found: {result.files_found}")
    lines.append(f"- Files analyzed: {result.files_analyzed}")
    lines.append(f"- Files generated: {len(result.generated_files)}")

    # What failed
    if result.errors:
        lines.append("")
        lines.append("## Issues Encountered")
        for e in result.errors:
            lines.append(f"- {e.message}")

    # Suggestions
    lines.append("")
    lines.append("## Next Steps")
    if not result.success:
        for e in result.errors:
            suggestion = get_recovery_suggestion(e)
            lines.append(f"- {suggestion}")

    return "\n".join(lines)
```

#### 16.3.5 Implement Timeout Handling

```python
async def with_timeout(
    coro: Coroutine,
    timeout: int,
    operation_name: str
) -> Tuple[Any, Optional[CampaignError]]:
    try:
        result = await asyncio.wait_for(coro, timeout=timeout)
        return result, None
    except asyncio.TimeoutError:
        return None, CampaignError(
            code=ErrorCode.E503,
            severity=ErrorSeverity.ERROR,
            message=f"{operation_name} timed out after {timeout}s",
            suggestion=f"Try increasing the timeout or simplifying the input"
        )
```

#### 16.3.6 Implement Context-Aware Error Messages

```python
def format_error_with_context(
    error: CampaignError,
    file_guides: List[FileGuide]
) -> str:
    """Add context about what information IS available."""
    msg = f"[{error.code}] {error.message}"

    if error.code == "E401":  # Missing force field
        # List what force field info we DO have
        available = []
        for fg in file_guides:
            if fg.pair_coeffs:
                available.append(f"  - {fg.file_name}: {len(fg.pair_coeffs)} pair coeffs")

        if available:
            msg += "\n\nForce field information found in:\n" + "\n".join(available)
        else:
            msg += "\n\nNo force field information found in any provided file."

    return msg
```

#### 16.3.7 Update Runner with Error Handling

Integrate all error handling into runner:

```python
async def run_campaign_builder(...) -> CampaignBuilderResult:
    error_handler = ErrorHandler()

    try:
        # Stage 1: Discovery
        files = discover_files(workspace)
        if not files:
            error_handler.add(CampaignError(
                code=ErrorCode.E402,
                severity=ErrorSeverity.FATAL,
                message="No supported files found",
                suggestion="Provide files in supported formats (.data, .pdf, .xlsx, etc.)"
            ))
            if not error_handler.can_continue():
                return create_failed_result(error_handler, ...)

        # Stage 2: Analysis (with partial failure handling)
        batch_result = await analyze_all_files(files, ...)

        for err in batch_result.errors:
            error_handler.add(err)

        if not batch_result.file_guides:
            error_handler.add(CampaignError(
                code=ErrorCode.E406,
                severity=ErrorSeverity.FATAL,
                message="No files could be analyzed",
                details={"failed_files": [str(f) for f in files]}
            ))
            if not error_handler.can_continue():
                return create_failed_result(error_handler, ...)

        # Stage 3: Planning (with recovery)
        campaign_result, plan_error = await with_timeout(
            run_campaign_planner(intent, batch_result.file_guides, ...),
            timeout=180,
            operation_name="Campaign planning"
        )

        if plan_error:
            error_handler.add(plan_error)

        # ... continue with result compilation

    except Exception as e:
        error_handler.add(CampaignError(
            code=ErrorCode.E505,
            severity=ErrorSeverity.FATAL,
            message=f"Unexpected error: {str(e)}",
            details={"exception_type": type(e).__name__}
        ))
        return create_failed_result(error_handler, ...)
```

### 16.4 Verification Steps

1. **ErrorHandler works:**
   - [ ] Errors categorized correctly
   - [ ] has_fatal() accurate
   - [ ] can_continue() accurate
   - [ ] Report formatted correctly

2. **Graceful degradation:**
   - [ ] Partial file analysis continues
   - [ ] Missing optional info uses defaults
   - [ ] Fatal errors stop pipeline

3. **Suggestions helpful:**
   - [ ] Each error has suggestion
   - [ ] Suggestions are actionable
   - [ ] Context is included

4. **Timeout handling:**
   - [ ] Long operations timeout
   - [ ] Error created on timeout
   - [ ] Pipeline can recover

### 16.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/schemas/errors.py` | Modified | Complete ErrorHandler |
| `campaign_builder/agent/runner.py` | Modified | Add error handling |
| `tests/test_runner.py` | Modified | Add error tests |

---

## Implementation Notes

### Error Logging

Use structured logging:
```python
logger.error(
    "File analysis failed",
    extra={
        "file": str(file_path),
        "error_code": error.code,
        "duration_ms": duration
    }
)
```

### Error Aggregation

When multiple errors occur:
- Group by type/severity
- Show most important first
- Limit displayed errors (show "and N more")

### User Experience

Error messages should be:
- Clear (what happened)
- Actionable (what to do)
- Specific (which file/parameter)

### Next Thrust

After completing Thrusts 15-16, proceed to [10-cli.md](./10-cli.md) for CLI implementation.
