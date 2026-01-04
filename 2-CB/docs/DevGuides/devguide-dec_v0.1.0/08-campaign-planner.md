# Campaign Planner Agent

This file contains Thrusts 13-14: Campaign Planner agent implementation.

---

## Thrust 13: Campaign Planner Core Implementation

### 13.1 Objective

Implement the Campaign Planner agent that generates validated simulation input decks from user intent and File Guides.

### 13.2 Background

The Campaign Planner is the main agent that:
- Receives user intent and File Guides
- Plans simulation workflow
- Generates complete input decks
- Validates all output
- Reports what it created and why

### 13.3 Subtasks

#### 13.3.1 Define Campaign Result Types

In `campaign_builder/agent/campaign_planner.py`:

```python
@dataclass
class GeneratedFile:
    path: Path
    purpose: str
    engine: str  # "lammps" or "qe"
    validation: ValidationResult

@dataclass
class CampaignPlanResult:
    success: bool
    intent_analysis: str
    campaign_plan: str
    generated_files: List[GeneratedFile]
    parameter_manifest: Dict[str, ParameterSource]
    assumptions: List[str]
    warnings: List[str]
    errors: List[CampaignError]
    iterations_used: int
    duration_ms: int

@dataclass
class ParameterSource:
    value: str
    source_file: str
    source_location: str  # "line 47" or "cell B5"
    is_default: bool
    default_reason: Optional[str]
```

#### 13.3.2 Create File Guide Formatter

```python
def format_file_guides_for_agent(
    file_guides: List[FileGuide]
) -> str
```

**Format each File Guide as markdown:**

```python
def format_file_guides_for_agent(file_guides: List[FileGuide]) -> str:
    sections = []

    for fg in file_guides:
        sections.append(fg.to_markdown())
        sections.append("---")

    return "\n".join(sections)
```

#### 13.3.3 Create User Prompt Builder

```python
def build_campaign_planner_prompt(
    intent: str,
    file_guides: List[FileGuide],
    workspace: Path,
    output_dir: Optional[Path] = None
) -> str
```

**Build prompt:**

```python
def build_campaign_planner_prompt(...) -> str:
    output_path = output_dir or workspace

    prompt = f"""
## User Intent

{intent}

## Workspace

Working directory: {workspace}
Output directory: {output_path}

## Available File Guides

The following files have been analyzed. Use ONLY information from these File Guides to generate simulation input decks.

{format_file_guides_for_agent(file_guides)}

## Your Task

1. Analyze the user intent and File Guides
2. Check for missing critical information - STOP if force field parameters are missing
3. Generate complete, validated simulation input decks
4. Validate each file using the validate_deck tool
5. Report all generated files with validation results

Write files to: {output_path}
"""
    return prompt
```

#### 13.3.4 Implement run_campaign_planner Function

```python
async def run_campaign_planner(
    intent: str,
    file_guides: List[FileGuide],
    workspace: Path,
    output_dir: Optional[Path] = None,
    max_iterations: int = 10,
    timeout: int = 180
) -> CampaignPlanResult
```

**Implementation:**

1. **Validate inputs:**
   ```python
   if not file_guides:
       return CampaignPlanResult(
           success=False,
           errors=[CampaignError(
               code=ErrorCode.E402,
               severity=ErrorSeverity.FATAL,
               message="No File Guides provided"
           )],
           ...
       )
   ```

2. **Check for force field information:**
   ```python
   has_force_field = any(
       fg.pair_coeffs or fg.parameters_mentioned
       for fg in file_guides
   )
   if not has_force_field:
       # Log warning but continue - agent will handle
       logger.warning("No force field info found in File Guides")
   ```

3. **Build prompt:**
   ```python
   user_prompt = build_campaign_planner_prompt(
       intent=intent,
       file_guides=file_guides,
       workspace=workspace,
       output_dir=output_dir
   )
   ```

4. **Configure agent:**
   ```python
   options = AgentOptions(
       system_prompt=CAMPAIGN_PLANNER_PROMPT,
       allowed_tools=["Write", "validate_deck", "Read"],
       max_turns=max_iterations,
       working_directory=str(output_dir or workspace)
   )
   ```

5. **Run agent:**
   ```python
   start_time = time.time()
   try:
       agent = Agent(options)
       response = await agent.run(user_prompt, timeout=timeout)
   except Exception as e:
       return CampaignPlanResult(
           success=False,
           errors=[CampaignError(
               code=ErrorCode.E501,
               severity=ErrorSeverity.FATAL,
               message=f"Agent error: {str(e)}"
           )],
           ...
       )
   ```

6. **Parse response:**
   ```python
   result = parse_campaign_result(
       response=response,
       workspace=workspace,
       output_dir=output_dir or workspace
   )
   ```

7. **Find generated files:**
   ```python
   generated_files = discover_generated_files(output_dir or workspace)

   for file_path in generated_files:
       # Validate each discovered file
       engine = detect_engine_from_file(file_path)
       validation = validate_deck(file_path, engine)
       result.generated_files.append(GeneratedFile(
           path=file_path,
           purpose=infer_file_purpose(file_path),
           engine=engine,
           validation=validation
       ))
   ```

8. **Return result:**
   ```python
   result.duration_ms = int((time.time() - start_time) * 1000)
   result.iterations_used = response.turns_used
   return result
   ```

#### 13.3.5 Implement Response Parser

```python
def parse_campaign_result(
    response: AgentResponse,
    workspace: Path,
    output_dir: Path
) -> CampaignPlanResult
```

**Extract structured sections from response:**

1. **Intent analysis:**
   ```python
   intent_match = re.search(
       r'##?\s*Intent Analysis\s*\n(.*?)(?=##|\Z)',
       response.content,
       re.DOTALL | re.IGNORECASE
   )
   intent_analysis = intent_match.group(1).strip() if intent_match else ""
   ```

2. **Campaign plan:**
   ```python
   plan_match = re.search(
       r'##?\s*Campaign Plan\s*\n(.*?)(?=##|\Z)',
       response.content,
       re.DOTALL | re.IGNORECASE
   )
   campaign_plan = plan_match.group(1).strip() if plan_match else ""
   ```

3. **Assumptions:**
   ```python
   assumptions_match = re.search(
       r'##?\s*Assumptions.*?\n(.*?)(?=##|\Z)',
       response.content,
       re.DOTALL | re.IGNORECASE
   )
   if assumptions_match:
       assumptions = extract_bullet_points(assumptions_match.group(1))
   ```

4. **Warnings:**
   ```python
   warnings_match = re.search(
       r'##?\s*Warnings.*?\n(.*?)(?=##|\Z)',
       response.content,
       re.DOTALL | re.IGNORECASE
   )
   ```

5. **Parameter manifest:**
   ```python
   # Parse markdown table if present
   manifest = parse_parameter_manifest(response.content)
   ```

#### 13.3.6 Implement File Discovery

```python
def discover_generated_files(
    directory: Path,
    since: Optional[datetime] = None
) -> List[Path]
```

**Find newly created simulation files:**

```python
def discover_generated_files(directory: Path, since=None) -> List[Path]:
    patterns = [
        "in.*",           # LAMMPS input (in.minimize, in.equilibrate)
        "*.in",           # QE input
        "*.pwi",          # QE input
        "*.lmp",          # LAMMPS input
    ]

    files = []
    for pattern in patterns:
        for path in directory.glob(pattern):
            if path.is_file():
                if since is None or path.stat().st_mtime > since.timestamp():
                    files.append(path)

    return sorted(files)
```

#### 13.3.7 Implement Engine Detection

```python
def detect_engine_from_file(file_path: Path) -> str:
```

**Detection logic:**

1. By extension:
   - .pwi → "qe"
   - .in → check content

2. By content:
   - Contains "&CONTROL" → "qe"
   - Contains "units" → "lammps"

3. By filename:
   - Starts with "in." → "lammps"

#### 13.3.8 Implement Purpose Inference

```python
def infer_file_purpose(file_path: Path) -> str
```

**Common patterns:**

| Pattern | Purpose |
|---------|---------|
| in.minimize | Energy minimization |
| in.equilibrate | System equilibration |
| in.production | Production run |
| in.diffusion | Diffusion calculation |
| scf.in | Self-consistent field |
| relax.in | Geometry relaxation |
| vc-relax.in | Variable cell relaxation |
| bands.in | Band structure |

### 13.4 Verification Steps

1. **Input handling:**
   - [ ] Empty File Guides returns error
   - [ ] Intent is passed correctly
   - [ ] Workspace paths are resolved

2. **Agent execution:**
   - [ ] Correct prompt is generated
   - [ ] Agent has correct tools
   - [ ] Timeout is respected

3. **Response parsing:**
   - [ ] Intent analysis extracted
   - [ ] Campaign plan extracted
   - [ ] Assumptions extracted
   - [ ] Warnings extracted

4. **File discovery:**
   - [ ] Generated files found
   - [ ] Engine detected correctly
   - [ ] Purpose inferred

### 13.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/campaign_planner.py` | Modified | Add run_campaign_planner |
| `tests/test_campaign_planner.py` | Modified | Add tests |

---

## Thrust 14: Validation Integration and Repair Loop

### 14.1 Objective

Integrate validation into the campaign planning process with automatic repair attempts.

### 14.2 Background

Generated files must pass validation before being delivered:
- L0 and L1 are blocking
- L2 is blocking if engine available
- L3 produces warnings

If validation fails, the agent should attempt repairs (up to 3 times).

### 14.3 Subtasks

#### 14.3.1 Create Repair Request Format

```python
def format_repair_request(
    file_path: Path,
    validation_result: ValidationResult,
    attempt: int
) -> str
```

**Format for agent:**

```python
def format_repair_request(...) -> str:
    issues = []
    for issue in validation_result.all_issues:
        if issue.severity == "error":
            issues.append(f"- {issue.code}: {issue.message}")
            if issue.line_number:
                issues.append(f"  Line {issue.line_number}")
            if issue.suggestion:
                issues.append(f"  Suggestion: {issue.suggestion}")

    return f"""
## Validation Failed - Repair Attempt {attempt}/3

File: {file_path}

### Errors Found

{chr(10).join(issues)}

### Instructions

1. Read the file
2. Understand the errors
3. Fix each error
4. Write the corrected file
5. Validate again

Do not add placeholder values. If you cannot fix an error without inventing parameters, report what information is needed.
"""
```

#### 14.3.2 Implement Repair Loop

```python
async def validate_and_repair(
    file_path: Path,
    engine: str,
    agent: Agent,
    max_attempts: int = 3
) -> Tuple[ValidationResult, int]
```

**Implementation:**

```python
async def validate_and_repair(
    file_path: Path,
    engine: str,
    agent: Agent,
    max_attempts: int = 3
) -> Tuple[ValidationResult, int]:

    for attempt in range(1, max_attempts + 1):
        # Validate current state
        result = validate_deck(file_path, engine)

        if result.overall_passed:
            return result, attempt

        if attempt == max_attempts:
            # No more attempts
            return result, attempt

        # Generate repair request
        repair_prompt = format_repair_request(file_path, result, attempt)

        # Ask agent to repair
        try:
            await agent.run(repair_prompt)
        except Exception as e:
            logger.error(f"Repair attempt {attempt} failed: {e}")
            continue

    return result, max_attempts
```

#### 14.3.3 Integrate Repair into Campaign Planner

Modify `run_campaign_planner` to include repair:

```python
async def run_campaign_planner(...) -> CampaignPlanResult:
    # ... existing code ...

    # After initial generation, validate and repair each file
    for gen_file in result.generated_files:
        if not gen_file.validation.overall_passed:
            logger.info(f"Validation failed for {gen_file.path}, attempting repair")

            repaired_result, attempts = await validate_and_repair(
                file_path=gen_file.path,
                engine=gen_file.engine,
                agent=agent,
                max_attempts=3
            )

            gen_file.validation = repaired_result
            if not repaired_result.overall_passed:
                result.warnings.append(
                    f"{gen_file.path.name}: Validation failed after {attempts} repair attempts"
                )
```

#### 14.3.4 Create Validation Summary

```python
def create_validation_summary(
    generated_files: List[GeneratedFile]
) -> str
```

**Format:**

```python
def create_validation_summary(generated_files: List[GeneratedFile]) -> str:
    lines = ["## Validation Summary", ""]

    for gf in generated_files:
        v = gf.validation
        status = "PASSED" if v.overall_passed else "FAILED"
        lines.append(f"### {gf.path.name}: {status}")
        lines.append(f"- L0: {'PASS' if v.l0 and v.l0.passed else 'FAIL'}")
        lines.append(f"- L1: {'PASS' if v.l1 and v.l1.passed else 'FAIL'}")

        if v.l2:
            if v.l2.engine_available:
                lines.append(f"- L2: {'PASS' if v.l2.passed else 'FAIL'}")
            else:
                lines.append("- L2: SKIPPED (engine not available)")
        else:
            lines.append("- L2: NOT RUN")

        if v.l3 and v.l3.warnings:
            lines.append("- L3 Warnings:")
            for w in v.l3.warnings:
                lines.append(f"  - {w.message}")

        lines.append("")

    return "\n".join(lines)
```

#### 14.3.5 Implement Cannot-Fix Detection

Some issues cannot be fixed by the agent:

```python
def is_unfixable_error(issue: ValidationIssue) -> bool:
    """Determine if an error requires user input to fix."""
    unfixable_codes = {
        "L1_MISSING_PAIR_COEFF",  # Needs force field parameters
        "L1_MISSING_PP",           # Needs pseudopotential files
        "E401",                    # Missing force field
        "E402",                    # Missing structure
    }
    return issue.code in unfixable_codes
```

If all remaining errors are unfixable, stop repair attempts early:

```python
# In validate_and_repair:
unfixable = [i for i in result.all_issues if is_unfixable_error(i)]
if unfixable:
    logger.info("Unfixable errors detected, stopping repair attempts")
    result.suggestions.append(
        "Some errors require additional input files to fix"
    )
    break
```

#### 14.3.6 Create Missing Information Report

When validation fails due to missing info:

```python
def create_missing_info_report(
    validation_results: List[ValidationResult],
    file_guides: List[FileGuide]
) -> str
```

**Report format:**

```markdown
## Missing Information

The following information is needed but was not found in provided files:

### Force Field Parameters
- Pair coefficients for atom types 3, 4, 5 (C_carboxyl, O_carboxyl, H_carboxyl)

### What to Provide
- A force field file containing LJ parameters for these atom types
- Or explicit pair_coeff values in a parameter file

### Available in File Guides
- Types 1-2 parameters found in: structure.data (lines 45-52)
```

#### 14.3.7 Update CampaignPlanResult

Add validation details to result:

```python
@dataclass
class CampaignPlanResult:
    # ... existing fields ...
    validation_summary: str
    repair_attempts: Dict[str, int]  # file -> attempts used
    unfixable_issues: List[ValidationIssue]
    missing_info_report: Optional[str]
```

### 14.4 Verification Steps

1. **Repair loop works:**
   - [ ] Valid files pass immediately
   - [ ] Invalid files trigger repair
   - [ ] Max 3 attempts per file
   - [ ] Repairs are attempted correctly

2. **Unfixable detection:**
   - [ ] Missing force field stops repair
   - [ ] User is informed of needed info

3. **Summary generation:**
   - [ ] All files included
   - [ ] Correct pass/fail status
   - [ ] Warnings listed

4. **Integration:**
   - [ ] Repair integrated with planner
   - [ ] Results include repair info

### 14.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/campaign_planner.py` | Modified | Add repair loop |
| `tests/test_campaign_planner.py` | Modified | Add repair tests |

---

## Implementation Notes

### Agent State Preservation

The same agent instance should be used for initial generation and repairs:
- Maintains conversation context
- Can reference previous attempts
- Avoids re-explaining the task

### Validation Caching

Don't re-run unchanged validation levels:
- If L0 passes, don't re-run on repair attempt
- If only L1 failed, start from L1

### Timeout Management

Repair attempts should have independent timeouts:
- Initial generation: 180s
- Each repair: 60s

### Error Aggregation

Collect all errors across attempts:
- Track which errors were fixed
- Track which persist
- Report final state

### Next Thrust

After completing Thrusts 13-14, proceed to [09-orchestration.md](./09-orchestration.md) for orchestration runner implementation.
