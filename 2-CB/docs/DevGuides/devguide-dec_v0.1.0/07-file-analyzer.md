# FileAnalyzer Agent

This file contains Thrusts 11-12: FileAnalyzer sub-agent implementation.

---

## Thrust 11: FileAnalyzer Core Implementation

### 11.1 Objective

Implement the core FileAnalyzer function that analyzes a single file and produces a structured File Guide using the Claude Agent SDK.

### 11.2 Background

The FileAnalyzer is a sub-agent that:
- Receives a single file path
- Explores the file using available tools
- Produces a compact File Guide
- Handles errors gracefully
- Respects iteration limits

Each FileAnalyzer instance is independent and can run in parallel with others.

### 11.3 Subtasks

#### 11.3.1 Define AnalysisResult Type

In `campaign_builder/agent/file_analyzer.py`:

```python
@dataclass
class AnalysisResult:
    success: bool
    file_guide: Optional[FileGuide]
    errors: List[CampaignError]
    iterations_used: int
    duration_ms: int
```

#### 11.3.2 Create Pre-Check Function

```python
async def pre_check_file(
    file_path: Path
) -> Tuple[bool, Optional[CampaignError]]
```

**Pre-checks before spawning agent:**

1. **File exists:**
   - If not: return (False, E101_FILE_NOT_FOUND)

2. **File readable:**
   - Try to open file
   - If fails: return (False, E103_FILE_UNREADABLE)

3. **File size limit:**
   - Check size < 500MB
   - If too large: return (False, E102_FILE_TOO_LARGE)

4. **Binary check:**
   - If binary and not PDF/Excel: return (False, E106_BINARY_UNSUPPORTED)

5. **Empty check:**
   - If file is empty: return (False, E105_FILE_EMPTY)

6. **All passed:**
   - return (True, None)

#### 11.3.3 Create Tool Configuration

Define tools available to FileAnalyzer:

```python
def get_file_analyzer_tools(file_type: FileType) -> List[str]:
    """Get appropriate tools for file type."""
    base_tools = ["Read", "Grep", "Bash", "Glob"]

    if file_type == FileType.PDF:
        return base_tools + ["read_pdf"]
    elif file_type in [FileType.EXCEL]:
        return base_tools + ["read_excel"]
    elif file_type == FileType.CSV:
        return base_tools + ["read_csv"]
    else:
        return base_tools
```

#### 11.3.4 Implement analyze_file Function

```python
async def analyze_file(
    file_path: Union[str, Path],
    max_iterations: int = 15,
    timeout: int = 120
) -> AnalysisResult
```

**Implementation steps:**

1. **Convert and validate path:**
   ```python
   file_path = Path(file_path).resolve()
   ```

2. **Run pre-checks:**
   ```python
   ok, error = await pre_check_file(file_path)
   if not ok:
       return AnalysisResult(
           success=False,
           file_guide=None,
           errors=[error],
           iterations_used=0,
           duration_ms=0
       )
   ```

3. **Detect file type:**
   ```python
   file_type = detect_file_type(file_path)
   ```

4. **Compute file hash:**
   ```python
   file_hash = compute_file_hash(file_path)
   ```

5. **Get file metadata:**
   ```python
   file_size = file_path.stat().st_size
   ```

6. **Prepare agent prompt:**
   ```python
   user_prompt = f"""
   Analyze this file and produce a File Guide:

   File path: {file_path}
   File type: {file_type.value}
   File size: {file_size} bytes
   SHA256: {file_hash}

   Follow the analysis strategy for {file_type.value} files.
   Output a complete File Guide in the specified JSON format.
   """
   ```

7. **Configure agent:**
   ```python
   from claude_agent_sdk import Agent, AgentOptions

   options = AgentOptions(
       system_prompt=FILE_ANALYZER_PROMPT,
       allowed_tools=get_file_analyzer_tools(file_type),
       max_turns=max_iterations,
       working_directory=str(file_path.parent)
   )
   ```

8. **Run agent:**
   ```python
   start_time = time.time()
   try:
       agent = Agent(options)
       response = await agent.run(user_prompt, timeout=timeout)
       iterations = response.turns_used
   except TimeoutError:
       return AnalysisResult(
           success=False,
           file_guide=None,
           errors=[CampaignError(
               code=ErrorCode.E201,
               severity=ErrorSeverity.ERROR,
               message=f"Analysis timeout after {timeout}s"
           )],
           iterations_used=max_iterations,
           duration_ms=int((time.time() - start_time) * 1000)
       )
   except Exception as e:
       return AnalysisResult(
           success=False,
           file_guide=None,
           errors=[CampaignError(
               code=ErrorCode.E205,
               severity=ErrorSeverity.FATAL,
               message=f"Agent error: {str(e)}"
           )],
           iterations_used=0,
           duration_ms=int((time.time() - start_time) * 1000)
       )
   ```

9. **Parse File Guide from response:**
   ```python
   file_guide = parse_file_guide_from_response(
       response.content,
       file_path,
       file_type,
       file_size,
       file_hash
   )
   ```

10. **Return result:**
    ```python
    return AnalysisResult(
        success=file_guide is not None,
        file_guide=file_guide,
        errors=[],
        iterations_used=iterations,
        duration_ms=int((time.time() - start_time) * 1000)
    )
    ```

#### 11.3.5 Implement Response Parser

```python
def parse_file_guide_from_response(
    response_content: str,
    file_path: Path,
    file_type: FileType,
    file_size: int,
    file_hash: str
) -> Optional[FileGuide]
```

**Parsing strategy:**

1. **Look for JSON block:**
   ```python
   # Find JSON between ```json and ```
   json_match = re.search(r'```json\s*(.*?)\s*```', response_content, re.DOTALL)
   if json_match:
       try:
           data = json.loads(json_match.group(1))
           return FileGuide.from_dict(data)
       except json.JSONDecodeError:
           pass
   ```

2. **Look for raw JSON:**
   ```python
   # Try to find JSON object
   for line in response_content.split('\n'):
       if line.strip().startswith('{'):
           try:
               # Try to find complete JSON object
               data = json.loads(line.strip())
               return FileGuide.from_dict(data)
           except:
               pass
   ```

3. **Fallback: extract structured data:**
   ```python
   # Create minimal FileGuide from extracted information
   file_guide = FileGuide(
       file_path=str(file_path),
       file_name=file_path.name,
       file_type=file_type,
       file_size_bytes=file_size,
       sha256_hash=file_hash,
       purpose="Extracted from response",
       summary=response_content[:500],
       confidence="low",
       analysis_iterations=0
   )

   # Try to extract specific fields from response text
   # ... pattern matching for atom_count, box_dimensions, etc.

   return file_guide
   ```

#### 11.3.6 Implement Structured Extraction Helpers

For fallback parsing, create helpers:

```python
def extract_atom_count(text: str) -> Optional[int]:
    """Extract atom count from text."""
    patterns = [
        r'(\d+)\s+atoms',
        r'atom_count[:\s]+(\d+)',
        r'Number of atoms[:\s]+(\d+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None

def extract_box_dimensions(text: str) -> Optional[BoxDimensions]:
    """Extract box dimensions from text."""
    # Look for xlo/xhi patterns
    # ...
    pass
```

#### 11.3.7 Add Logging

Add comprehensive logging:

```python
import logging

logger = logging.getLogger(__name__)

# In analyze_file:
logger.info(f"Starting analysis of {file_path}")
logger.debug(f"File type: {file_type}, size: {file_size}")
# ... after agent run:
logger.info(f"Analysis complete in {duration_ms}ms, {iterations} iterations")
```

### 11.4 Verification Steps

1. **Pre-checks work:**
   - [ ] Missing file returns E101
   - [ ] Large file returns E102
   - [ ] Unreadable file returns E103
   - [ ] Binary file returns E106
   - [ ] Empty file returns E105

2. **Agent execution:**
   - [ ] Agent receives correct prompt
   - [ ] Agent has correct tools
   - [ ] Timeout is respected
   - [ ] Iterations are counted

3. **Response parsing:**
   - [ ] JSON blocks are extracted
   - [ ] FileGuide is created correctly
   - [ ] Fallback parsing works

4. **Error handling:**
   - [ ] Timeout creates correct error
   - [ ] Agent failures are captured
   - [ ] All errors include context

### 11.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/file_analyzer.py` | Modified | Add analyze_file |
| `tests/test_file_analyzer.py` | Modified | Add unit tests |

---

## Thrust 12: Parallel File Analysis

### 12.1 Objective

Implement parallel analysis of multiple files for efficient processing of entire workspaces.

### 12.2 Background

When a workspace contains multiple files:
- Each file should be analyzed independently
- Analysis should run in parallel for efficiency
- Failures shouldn't block other analyses
- Results should be aggregated properly

### 12.3 Subtasks

#### 12.3.1 Define Batch Result Type

```python
@dataclass
class BatchAnalysisResult:
    total_files: int
    successful: int
    failed: int
    file_guides: List[FileGuide]
    errors: List[CampaignError]
    total_duration_ms: int
    parallel: bool
```

#### 12.3.2 Implement analyze_all_files Function

```python
async def analyze_all_files(
    file_paths: List[Union[str, Path]],
    max_iterations: int = 15,
    max_concurrent: int = 5,
    timeout_per_file: int = 120
) -> BatchAnalysisResult
```

**Implementation:**

1. **Validate inputs:**
   ```python
   if not file_paths:
       return BatchAnalysisResult(
           total_files=0,
           successful=0,
           failed=0,
           file_guides=[],
           errors=[],
           total_duration_ms=0,
           parallel=False
       )

   paths = [Path(p).resolve() for p in file_paths]
   ```

2. **Create analysis tasks:**
   ```python
   async def analyze_with_tracking(path: Path, index: int):
       logger.info(f"[{index+1}/{len(paths)}] Analyzing {path.name}")
       result = await analyze_file(
           path,
           max_iterations=max_iterations,
           timeout=timeout_per_file
       )
       return (path, result)

   tasks = [
       analyze_with_tracking(path, i)
       for i, path in enumerate(paths)
   ]
   ```

3. **Run with concurrency limit:**
   ```python
   import asyncio

   semaphore = asyncio.Semaphore(max_concurrent)

   async def limited_analyze(task):
       async with semaphore:
           return await task

   start_time = time.time()
   results = await asyncio.gather(
       *[limited_analyze(t) for t in tasks],
       return_exceptions=True
   )
   total_duration = int((time.time() - start_time) * 1000)
   ```

4. **Process results:**
   ```python
   file_guides = []
   errors = []
   successful = 0
   failed = 0

   for path, result in results:
       if isinstance(result, Exception):
           failed += 1
           errors.append(CampaignError(
               code=ErrorCode.E205,
               severity=ErrorSeverity.ERROR,
               message=f"Unexpected error analyzing {path.name}: {result}",
               file_path=str(path)
           ))
       elif result.success:
           successful += 1
           file_guides.append(result.file_guide)
       else:
           failed += 1
           errors.extend(result.errors)
   ```

5. **Return aggregated result:**
   ```python
   return BatchAnalysisResult(
       total_files=len(paths),
       successful=successful,
       failed=failed,
       file_guides=file_guides,
       errors=errors,
       total_duration_ms=total_duration,
       parallel=max_concurrent > 1
   )
   ```

#### 12.3.3 Implement File Discovery

```python
def discover_files(
    workspace: Path,
    include_patterns: Optional[List[str]] = None,
    exclude_patterns: Optional[List[str]] = None
) -> List[Path]
```

**Default patterns:**

Include by default:
- *.data, *.lmp (LAMMPS data)
- *.in (LAMMPS/QE input)
- *.pwi (QE input)
- *.pdf, *.xlsx, *.xls, *.csv
- POSCAR, CONTCAR
- *.cif, *.xyz, *.pdb

Exclude by default:
- __pycache__/
- .git/
- *.pyc
- .DS_Store

**Implementation:**
```python
from pathlib import Path
import fnmatch

def discover_files(workspace: Path, ...) -> List[Path]:
    files = []

    for path in workspace.rglob('*'):
        if path.is_file():
            # Check exclusions
            if any(fnmatch.fnmatch(str(path), p) for p in exclude_patterns):
                continue

            # Check inclusions
            if include_patterns:
                if any(fnmatch.fnmatch(path.name, p) for p in include_patterns):
                    files.append(path)
            else:
                # Use default patterns
                if is_supported_file(path):
                    files.append(path)

    return sorted(files)
```

#### 12.3.4 Implement File Type Filtering

```python
def is_supported_file(path: Path) -> bool:
    """Check if file type is supported for analysis."""
    supported_extensions = {
        '.data', '.lmp', '.lammps',  # LAMMPS data
        '.in', '.pwi',                # Input scripts
        '.pwo', '.out',               # Output files
        '.vasp', '.poscar',           # POSCAR
        '.cif', '.xyz', '.pdb',       # Structure formats
        '.pdf',                        # Documents
        '.xlsx', '.xls', '.csv',      # Spreadsheets
    }

    # Check extension
    if path.suffix.lower() in supported_extensions:
        return True

    # Check exact filename
    if path.name.upper() in {'POSCAR', 'CONTCAR'}:
        return True

    return False
```

#### 12.3.5 Implement Progress Reporting

```python
from typing import Callable, Optional

async def analyze_all_files_with_progress(
    file_paths: List[Path],
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    **kwargs
) -> BatchAnalysisResult
```

**Progress callback signature:**
```python
def on_progress(completed: int, total: int, current_file: str):
    print(f"[{completed}/{total}] Analyzing {current_file}")
```

#### 12.3.6 Implement Graceful Degradation

When some files fail:

```python
def assess_batch_result(result: BatchAnalysisResult) -> ErrorSeverity:
    """Determine overall severity of batch result."""
    if result.successful == 0:
        return ErrorSeverity.FATAL
    elif result.failed > 0:
        return ErrorSeverity.WARNING
    else:
        return ErrorSeverity.INFO
```

#### 12.3.7 Update Module Exports

Update `campaign_builder/agent/__init__.py`:
```python
from .file_analyzer import (
    analyze_file,
    analyze_all_files,
    discover_files,
    AnalysisResult,
    BatchAnalysisResult
)
```

### 12.4 Verification Steps

1. **Parallel execution:**
   - [ ] Multiple files analyzed concurrently
   - [ ] Concurrency limit respected
   - [ ] Total time < sum of individual times

2. **Error handling:**
   - [ ] One failure doesn't block others
   - [ ] Errors are collected properly
   - [ ] Successful guides are preserved

3. **File discovery:**
   - [ ] Finds supported file types
   - [ ] Respects exclude patterns
   - [ ] Handles empty directories

4. **Progress reporting:**
   - [ ] Callback called for each file
   - [ ] Progress numbers accurate

5. **Graceful degradation:**
   - [ ] Partial success returns results
   - [ ] FATAL only when all fail

### 12.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/file_analyzer.py` | Modified | Add parallel analysis |
| `campaign_builder/agent/__init__.py` | Modified | Export functions |
| `tests/test_file_analyzer.py` | Modified | Add batch tests |

---

## Implementation Notes

### Asyncio Patterns

Use proper async patterns:
```python
# Good: parallel with gather
results = await asyncio.gather(*tasks)

# Good: semaphore for rate limiting
async with semaphore:
    result = await process()

# Good: timeout handling
try:
    result = await asyncio.wait_for(coro, timeout=30)
except asyncio.TimeoutError:
    handle_timeout()
```

### Memory Management

For large batches:
- Don't hold all file contents in memory
- Process results incrementally
- Clear large objects when done

### Agent SDK Integration

The Claude Agent SDK provides:
- Automatic tool handling
- Turn counting
- Timeout management
- Error wrapping

Wrap SDK usage appropriately for your needs.

### Next Thrust

After completing Thrusts 11-12, proceed to [08-campaign-planner.md](./08-campaign-planner.md) for Campaign Planner implementation.
