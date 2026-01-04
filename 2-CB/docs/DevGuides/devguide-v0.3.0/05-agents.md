# DevGuide v0.3.0: Agent LLM Integration

**Thrusts 10-11: FileAnalyzer and CampaignPlanner LLM Integration**

---

## Thrust 10: FileAnalyzer LLM Integration

### 10.1 Objective

Replace the deterministic regex-based file analysis in FileAnalyzer with LLM-powered semantic analysis that produces structured FileGuide output.

### 10.2 Background

The current FileAnalyzer in `campaign_builder/agent/file_analyzer.py` uses:
- Regex patterns to detect file types
- String parsing to extract atom counts, box dimensions
- Hardcoded section detection for LAMMPS data files

This works for well-formatted files but fails when:
- Files have non-standard formatting
- Data is embedded in comments
- Force field parameters use unusual notation

The LLM-powered version will:
- Read the file content
- Understand what the file represents semantically
- Extract all relevant information into a structured FileGuide
- Handle edge cases gracefully

### 10.3 Subtasks

#### 10.3.1 Create LLM-powered analyze function

Modify `campaign_builder/agent/file_analyzer.py` to add:

**analyze_file_llm(file_path, provider, config) -> AnalysisResult**

This function:
1. Reads the file content
2. Detects file type using existing heuristics (for tool selection)
3. Builds analysis prompt with file content
4. Calls provider.run() with appropriate tools
5. Parses LLM response into FileGuide
6. Returns AnalysisResult

**Prompt structure:**
```
Analyze this simulation file and extract structured information.

File: {filename}
Type: {detected_type}

Content:
```
{file_content}
```

Extract the following information into JSON format:
- file_type: The type of file (lammps_data, lammps_input, qe_input, etc.)
- purpose: What this file is for (1-2 sentences)
- atom_count: Number of atoms (if applicable)
- atom_types_count: Number of atom types (if applicable)
- box_dimensions: Simulation box size (if applicable)
- pair_style: Force field style (if found)
- pair_coeffs: Force field parameters (if found)
- missing_info: List of information that appears to be missing
- confidence: Your confidence in this analysis (high/medium/low)

Respond with ONLY the JSON object, no additional text.
```

#### 10.3.2 Parse FileGuide from LLM response

Create parser function:

**parse_file_guide_response(response: str, file_path: Path) -> FileGuide**

The parser must:
1. Extract JSON from response (handle markdown code blocks)
2. Validate required fields are present
3. Convert to FileGuide dataclass
4. Handle partial responses gracefully
5. Set defaults for missing optional fields

Error handling:
- If JSON parsing fails, retry with simplified prompt
- If retries exhausted, return partial FileGuide with error noted
- Log parsing issues for debugging

#### 10.3.3 Integrate tools for enhanced analysis

When analyzing, make these tools available:
- `read_file`: For reading additional referenced files
- `validate_lammps_syntax`: To check if LAMMPS file is valid
- `validate_qe_syntax`: To check if QE file is valid

The LLM can use these tools to:
- Read referenced data files mentioned in input scripts
- Validate syntax to confirm file type detection
- Cross-reference information across files

#### 10.3.4 Maintain backward compatibility

Keep the existing deterministic parsing as fallback:

**analyze_file(file_path, use_llm=True, provider=None) -> AnalysisResult**

The function should:
1. If use_llm is True and provider is available:
   - Try LLM-based analysis
   - On failure, fall back to deterministic
2. If use_llm is False or provider unavailable:
   - Use existing deterministic parsing
3. Log which method was used

This ensures:
- Existing tests continue to pass
- System works without API access
- Gradual migration is possible

#### 10.3.5 Update batch analysis

Modify `analyze_all_files()` to:
1. Accept optional provider parameter
2. Share provider across files for efficiency
3. Use semaphore to limit concurrent API calls
4. Report progress including which method was used

### 10.4 Verification Steps

1. Test LLM analysis of LAMMPS data file:
   ```
   python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.file_analyzer import analyze_file
   from campaign_builder.agent.factory import get_provider

   async def test():
       provider = get_provider()
       result = await analyze_file(
           Path('/tmp/test_workspace/test.data'),
           use_llm=True,
           provider=provider
       )
       print(f'Success: {result.success}')
       print(f'File type: {result.file_guide.file_type}')
       print(f'Atom count: {result.file_guide.atom_count}')
       print(f'Iterations: {result.iterations_used}')

   asyncio.run(test())
   "
   ```
   Expected: Successful analysis with correct atom count

2. Test fallback to deterministic:
   ```
   python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.file_analyzer import analyze_file

   async def test():
       result = await analyze_file(
           Path('/tmp/test_workspace/test.data'),
           use_llm=False
       )
       print(f'Success: {result.success}')
       print(f'File type: {result.file_guide.file_type}')
       print(f'Atom count: {result.file_guide.atom_count}')

   asyncio.run(test())
   "
   ```
   Expected: Successful analysis using deterministic method

3. Test with mock provider:
   ```
   AGENT_PROVIDER=mock python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.file_analyzer import analyze_file
   from campaign_builder.agent.factory import get_provider

   async def test():
       provider = get_provider()
       result = await analyze_file(
           Path('/tmp/test_workspace/test.data'),
           use_llm=True,
           provider=provider
       )
       print(f'Success: {result.success}')
       print(f'Provider: mock')

   asyncio.run(test())
   "
   ```
   Expected: Successful with mock responses

4. Run analyzer tests:
   ```
   pytest tests/test_file_analyzer.py -v
   ```
   Expected: All existing tests pass, new LLM tests pass

### 10.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/file_analyzer.py` | Modified | Add LLM analysis |
| `tests/test_file_analyzer.py` | Modified | Add LLM integration tests |

---

## Thrust 11: CampaignPlanner LLM Integration

### 11.1 Objective

Integrate LLM into CampaignPlanner to generate simulation input decks from natural language intent and FileGuides.

### 11.2 Background

The current CampaignPlanner in `campaign_builder/agent/campaign_planner.py`:
- Uses template-based generation
- Substitutes parameters from FileGuides
- Has limited natural language understanding

The LLM-powered version will:
- Understand complex user intent
- Generate appropriate simulation input files
- Self-validate and repair generated files
- Document assumptions and decisions

### 11.3 Subtasks

#### 11.3.1 Create LLM-powered planner function

Modify `campaign_builder/agent/campaign_planner.py` to add:

**run_campaign_planner_llm(intent, file_guides, workspace, output_dir, provider) -> CampaignPlanResult**

This function:
1. Formats FileGuides as context for the LLM
2. Builds planning prompt with intent and context
3. Calls provider.run() with generation and validation tools
4. Collects generated files
5. Validates each generated file
6. Returns comprehensive CampaignPlanResult

**System prompt structure:**
The system prompt should be the CAMPAIGN_PLANNER_PROMPT from prompts.py, which instructs Claude on:
- Reading FileGuides for parameters
- Never inventing force field parameters
- Using validation tools to check output
- Documenting assumptions
- Iterating until validation passes

**User prompt structure:**
```
Generate simulation input files for the following intent:

Intent: {user_intent}

Available information from analyzed files:

{formatted_file_guides}

Requirements:
1. Generate valid simulation input files
2. Use ONLY parameters found in the file guides above
3. Validate your output using the validation tools
4. Document any assumptions you make
5. If information is missing, note it clearly

Output the generated files using the write_file tool.
```

#### 11.3.2 Implement validation loop

The planner should self-validate:

1. Generate initial input file
2. Call validate_full tool on generated file
3. If validation fails:
   - Read validation errors
   - Generate repair plan
   - Modify the file
   - Re-validate
4. Repeat up to 3 times
5. If still failing, return with errors documented

Track validation iterations in the result.

#### 11.3.3 Handle missing information

When FileGuides don't contain required parameters:

1. LLM identifies what's missing
2. LLM documents this in the result
3. LLM either:
   - Uses safe defaults with clear documentation
   - Leaves placeholders with instructions
   - Aborts with clear error message

Never invent force field parameters - this is a critical safety rule.

#### 11.3.4 Collect generated files

After LLM completes:
1. Scan output_dir for new files
2. Validate each file
3. Compute file hashes
4. Build GeneratedFile objects
5. Include in result

#### 11.3.5 Maintain backward compatibility

Keep existing generation as fallback:

**run_campaign_planner(intent, file_guides, workspace, output_dir, use_llm=True, provider=None) -> CampaignPlanResult**

Similar pattern to FileAnalyzer:
- Try LLM if available and enabled
- Fall back to template-based if needed
- Log which method was used

### 11.4 Verification Steps

1. Test LLM-powered generation:
   ```
   python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.campaign_planner import run_campaign_planner
   from campaign_builder.agent.file_analyzer import analyze_file
   from campaign_builder.agent.factory import get_provider

   async def test():
       # First analyze a data file
       provider = get_provider()
       analysis = await analyze_file(
           Path('/tmp/test_workspace/test.data'),
           use_llm=True,
           provider=provider
       )

       # Then generate a campaign
       result = await run_campaign_planner(
           intent='Energy minimization followed by NVT at 300K',
           file_guides=[analysis.file_guide],
           workspace=Path('/tmp/test_workspace'),
           output_dir=Path('/tmp/test_output'),
           use_llm=True,
           provider=provider
       )
       print(f'Success: {result.success}')
       print(f'Generated files: {len(result.generated_files)}')
       print(f'Assumptions: {result.assumptions}')

   asyncio.run(test())
   "
   ```
   Expected: Generated files with validation results

2. Test validation loop:
   ```
   python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.campaign_planner import run_campaign_planner
   from campaign_builder.agent.factory import get_provider
   from campaign_builder.schemas import FileGuide, FileType

   async def test():
       provider = get_provider()

       # Create minimal file guide
       guide = FileGuide(
           file_path='/tmp/test.data',
           file_name='test.data',
           file_type=FileType.LAMMPS_DATA,
           file_size_bytes=1000,
           sha256_hash='abc123',
           purpose='Structure file',
           summary='Contains 20 atoms',
           confidence='high',
           atom_count=20,
           atom_types_count=4,
       )

       result = await run_campaign_planner(
           intent='Run MD at 300K for 100ps',
           file_guides=[guide],
           workspace=Path('/tmp/test_workspace'),
           output_dir=Path('/tmp/test_output'),
           use_llm=True,
           provider=provider
       )
       print(f'Iterations: {result.iterations_used}')
       print(f'Errors: {[e.message for e in result.errors]}')

   asyncio.run(test())
   "
   ```
   Expected: Planner iterates to fix validation errors

3. Test missing information handling:
   ```
   python -c "
   import asyncio
   from pathlib import Path
   from campaign_builder.agent.campaign_planner import run_campaign_planner
   from campaign_builder.agent.factory import get_provider
   from campaign_builder.schemas import FileGuide, FileType

   async def test():
       provider = get_provider()

       # Minimal guide with NO force field info
       guide = FileGuide(
           file_path='/tmp/test.data',
           file_name='test.data',
           file_type=FileType.LAMMPS_DATA,
           file_size_bytes=1000,
           sha256_hash='abc123',
           purpose='Structure file',
           summary='Contains atoms but no force field',
           confidence='medium',
           atom_count=20,
       )

       result = await run_campaign_planner(
           intent='Run simulation',
           file_guides=[guide],
           workspace=Path('/tmp'),
           output_dir=Path('/tmp/output'),
           use_llm=True,
           provider=provider
       )
       print(f'Warnings: {result.warnings}')
       print(f'Missing info documented: {len(result.warnings) > 0}')

   asyncio.run(test())
   "
   ```
   Expected: Warnings about missing force field info

4. Run planner tests:
   ```
   pytest tests/test_campaign_planner.py -v
   ```
   Expected: All existing tests pass, new LLM tests pass

### 11.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/campaign_planner.py` | Modified | Add LLM planning |
| `tests/test_campaign_planner.py` | Modified | Add LLM integration tests |

---

## Phase 4 Completion Checklist

Before moving to Phase 5, verify:

- [ ] FileAnalyzer uses LLM when provider available
- [ ] FileAnalyzer falls back to deterministic when needed
- [ ] FileAnalyzer produces valid FileGuides from LLM
- [ ] CampaignPlanner uses LLM for generation
- [ ] CampaignPlanner validates its own output
- [ ] CampaignPlanner documents assumptions
- [ ] CampaignPlanner handles missing info gracefully
- [ ] Both agents work with all three adapters
- [ ] All existing tests continue to pass
- [ ] New LLM integration tests pass

---

## Next Document

Continue to [06-integration.md](./06-integration.md) for Thrusts 12-13: End-to-end testing and reliability hardening.
