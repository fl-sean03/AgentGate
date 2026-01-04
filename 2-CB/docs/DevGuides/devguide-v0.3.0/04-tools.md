# DevGuide v0.3.0: Tool Migration

**Thrusts 7-9: Document Tools, Validation Tools, Utility Tools**

---

## Thrust 7: Document Tool Registration

### 7.1 Objective

Migrate existing document reading tools (PDF, Excel, CSV) to the new ToolDefinition format and register them in the central registry.

### 7.2 Background

The existing document tools in `campaign_builder/tools/documents/` are implemented as standalone functions:
- `pdf_reader.py` - Extract text from PDFs
- `excel_reader.py` - Parse Excel files
- `csv_reader.py` - Parse CSV files

These need to be wrapped as ToolDefinition objects so that:
1. LLM agents can discover and use them
2. They work with any adapter (Claude SDK, Anthropic, Mock)
3. Their schemas are standardized

### 7.3 Subtasks

#### 7.3.1 Create tool wrapper module

Create `campaign_builder/agent/tools/documents.py` with:

**Tool: read_pdf**
- Name: `read_pdf`
- Description: "Extract text content from a PDF file. Returns the full text or an error message."
- Parameters:
  - `path` (string, required): Absolute or relative path to the PDF file
  - `max_pages` (integer, optional): Maximum number of pages to read (default: all)
- Handler: Wraps existing `extract_pdf_text()` function
- Returns: Extracted text or error message

**Tool: read_excel**
- Name: `read_excel`
- Description: "Read data from an Excel spreadsheet. Returns content as formatted text."
- Parameters:
  - `path` (string, required): Path to the Excel file
  - `sheet_name` (string, optional): Specific sheet to read (default: first sheet)
  - `max_rows` (integer, optional): Maximum rows to read (default: 1000)
- Handler: Wraps existing `read_excel_file()` function
- Returns: Formatted table data or error message

**Tool: read_csv**
- Name: `read_csv`
- Description: "Read data from a CSV file. Automatically detects delimiter."
- Parameters:
  - `path` (string, required): Path to the CSV file
  - `max_rows` (integer, optional): Maximum rows to read (default: 1000)
- Handler: Wraps existing `read_csv_file()` function
- Returns: Formatted table data or error message

#### 7.3.2 Add error handling

Each tool handler must:
1. Validate the path exists and is readable
2. Catch and wrap exceptions appropriately
3. Return clear error messages that help the LLM understand what went wrong

Error format:
```
Error reading [filename]: [specific error]
Suggestion: [what to try instead]
```

#### 7.3.3 Register tools on import

At the bottom of `documents.py`:
- Import the default registry
- Register all three tools
- Export the tool objects for direct access if needed

#### 7.3.4 Add output formatting

Tool outputs should be formatted for LLM consumption:
- PDF text: Preserve structure with clear section breaks
- Excel data: Format as markdown table or clear columns
- CSV data: Format as markdown table with headers

Truncation rules:
- If content exceeds 10,000 characters, truncate with message
- Show first and last portions with "[... N characters truncated ...]"

### 7.4 Verification Steps

1. Verify tools are registered:
   ```
   python -c "
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.documents  # Triggers registration

   print('Registered tools:')
   for name in default_registry.list_names():
       print(f'  - {name}')
   "
   ```
   Expected: Shows read_pdf, read_excel, read_csv

2. Test PDF tool:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.documents

   async def test():
       tool = default_registry.get('read_pdf')
       # Create a test PDF or use existing one
       result = await tool.handler({'path': '/path/to/test.pdf'})
       print(f'Result length: {len(result)}')

   asyncio.run(test())
   "
   ```
   Expected: Returns text content or clear error

3. Test with LLM via adapter:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.factory import get_provider
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.documents

   async def test():
       provider = get_provider()
       tools = default_registry.filter_by_names(['read_pdf'])
       result = await provider.run(
           prompt='Read the PDF at docs/example.pdf and summarize it',
           system_prompt='You analyze documents.',
           tools=tools
       )
       print(f'Success: {result.success}')
       print(f'Tool calls: {len(result.tool_calls)}')

   asyncio.run(test())
   "
   ```
   Expected: LLM successfully uses the tool

4. Run tool tests:
   ```
   pytest tests/test_tools_documents_registered.py -v
   ```
   Expected: All tests pass

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/tools/__init__.py` | Created | Tools subpackage |
| `campaign_builder/agent/tools/documents.py` | Created | Document tool wrappers |
| `tests/test_tools_documents_registered.py` | Created | Registration tests |

---

## Thrust 8: Validation Tool Registration

### 8.1 Objective

Migrate validation tools (L0-L3) to the new ToolDefinition format, enabling LLM agents to validate generated files.

### 8.2 Background

The validation pipeline is critical for the "never ship broken files" guarantee. The existing validation tools in `campaign_builder/tools/validation/` provide:
- L0: Placeholder detection
- L1: Syntax validation (LAMMPS and QE)
- L2: Engine acceptance testing
- L3: Physics sanity checks

These become LLM tools so the CampaignPlanner can validate its own output.

### 8.3 Subtasks

#### 8.3.1 Create validation tool wrappers

Create `campaign_builder/agent/tools/validation.py` with:

**Tool: validate_l0**
- Name: `validate_l0`
- Description: "Check a file for placeholder patterns like {{VALUE}} or TODO. Returns list of found placeholders or confirmation that none exist."
- Parameters:
  - `content` (string, required): File content to validate
- Handler: Wraps existing L0 validation
- Returns: JSON with passed/failed and list of placeholders

**Tool: validate_lammps_syntax**
- Name: `validate_lammps_syntax`
- Description: "Check LAMMPS input file syntax. Validates commands, required keywords, and common errors."
- Parameters:
  - `content` (string, required): LAMMPS input file content
- Handler: Wraps existing L1 LAMMPS validation
- Returns: JSON with passed/failed, errors list, warnings list

**Tool: validate_qe_syntax**
- Name: `validate_qe_syntax`
- Description: "Check Quantum ESPRESSO input file syntax. Validates namelists, cards, and required parameters."
- Parameters:
  - `content` (string, required): QE input file content
- Handler: Wraps existing L1 QE validation
- Returns: JSON with passed/failed, errors list, warnings list

**Tool: validate_engine**
- Name: `validate_engine`
- Description: "Run the simulation engine in check mode to verify it accepts the input file. More thorough than syntax checking."
- Parameters:
  - `path` (string, required): Path to input file
  - `engine` (string, required): Engine name ("lammps" or "qe")
- Handler: Wraps existing L2 validation
- Returns: JSON with passed/skipped, output, errors

**Tool: check_physics**
- Name: `check_physics`
- Description: "Perform physics sanity checks on simulation parameters. Warns about unrealistic values."
- Parameters:
  - `content` (string, required): Input file content
  - `engine` (string, required): Engine name ("lammps" or "qe")
- Handler: Wraps existing L3 validation
- Returns: JSON with warnings list

**Tool: validate_full**
- Name: `validate_full`
- Description: "Run complete validation pipeline (L0 → L1 → L2 → L3) on a file."
- Parameters:
  - `path` (string, required): Path to input file
  - `engine` (string, optional): Engine name (auto-detected if not provided)
  - `stop_on_fail` (boolean, optional): Stop at first failure (default: false)
- Handler: Wraps existing unified validator
- Returns: Comprehensive validation report JSON

#### 8.3.2 Format output for LLM

Validation results should be formatted as clear JSON that the LLM can interpret:

```json
{
  "passed": false,
  "level": "L1",
  "errors": [
    {
      "line": 15,
      "message": "Unknown command: pair_stlye",
      "suggestion": "Did you mean 'pair_style'?"
    }
  ],
  "warnings": [],
  "summary": "1 error found in LAMMPS syntax validation"
}
```

#### 8.3.3 Handle engine paths

The L2 validation needs engine binaries. The tools should:
1. Read paths from environment variables (LAMMPS_BINARY, QE_BINARY)
2. Fall back to common locations
3. Return "skipped" status if engine not available (not an error)

#### 8.3.4 Register all validation tools

At bottom of `validation.py`:
- Register all six tools with default registry
- Group them under "validation" category for filtering

### 8.4 Verification Steps

1. Verify tools are registered:
   ```
   python -c "
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.validation

   validation_tools = [n for n in default_registry.list_names() if 'valid' in n.lower()]
   print(f'Validation tools: {validation_tools}')
   "
   ```
   Expected: Shows all 6 validation tools

2. Test L0 validation:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.validation

   async def test():
       tool = default_registry.get('validate_l0')
       result = await tool.handler({
           'content': 'pair_style {{PAIR_STYLE}}\nrun 1000'
       })
       print(result)

   asyncio.run(test())
   "
   ```
   Expected: Reports {{PAIR_STYLE}} placeholder found

3. Test LAMMPS syntax validation:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.validation

   async def test():
       tool = default_registry.get('validate_lammps_syntax')
       result = await tool.handler({
           'content': 'units real\natom_style full\nrun 1000'
       })
       print(result)

   asyncio.run(test())
   "
   ```
   Expected: Reports missing required commands

4. Run validation tool tests:
   ```
   pytest tests/test_tools_validation_registered.py -v
   ```
   Expected: All tests pass

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/tools/validation.py` | Created | Validation tool wrappers |
| `tests/test_tools_validation_registered.py` | Created | Registration tests |

---

## Thrust 9: Utility Tool Registration

### 9.1 Objective

Register utility tools for file operations and system commands that agents need for general operations.

### 9.2 Background

Beyond documents and validation, agents need basic utilities:
- Reading arbitrary files
- Writing generated content
- Finding files by pattern
- Searching file contents

These complement the SDK's built-in tools when using the raw Anthropic adapter.

### 9.3 Subtasks

#### 9.3.1 Create utility tool wrappers

Create `campaign_builder/agent/tools/utilities.py` with:

**Tool: read_file**
- Name: `read_file`
- Description: "Read the contents of a text file."
- Parameters:
  - `path` (string, required): Path to the file
  - `offset` (integer, optional): Line number to start from
  - `limit` (integer, optional): Maximum lines to read
- Handler: Read file with encoding detection
- Returns: File contents or error

**Tool: write_file**
- Name: `write_file`
- Description: "Write content to a file. Creates parent directories if needed."
- Parameters:
  - `path` (string, required): Path to write to
  - `content` (string, required): Content to write
- Handler: Write with directory creation
- Returns: Success confirmation or error

**Tool: glob_files**
- Name: `glob_files`
- Description: "Find files matching a glob pattern."
- Parameters:
  - `pattern` (string, required): Glob pattern (e.g., "*.data", "**/*.in")
  - `directory` (string, optional): Base directory (default: current)
- Handler: Python glob with pattern
- Returns: List of matching paths

**Tool: grep_content**
- Name: `grep_content`
- Description: "Search for a pattern in files."
- Parameters:
  - `pattern` (string, required): Regex pattern to search for
  - `path` (string, required): File or directory to search
  - `max_results` (integer, optional): Maximum matches to return
- Handler: Regex search with context
- Returns: Matching lines with file/line numbers

**Tool: get_file_info**
- Name: `get_file_info`
- Description: "Get metadata about a file (size, type, modification time)."
- Parameters:
  - `path` (string, required): Path to the file
- Handler: os.stat and magic number detection
- Returns: JSON with file metadata

#### 9.3.2 Security considerations

Utility tools must be sandboxed:
- Restrict file operations to workspace directory
- Block access to sensitive paths (/etc, ~/.ssh, etc.)
- Prevent directory traversal attacks (../)
- Log all file operations for audit

Implement `is_safe_path(path, workspace)` helper that validates paths.

#### 9.3.3 Performance optimization

For large files:
- Stream reading instead of loading entire file
- Truncate output with clear indication
- Cache file metadata for repeated access

#### 9.3.4 Register utility tools

At bottom of `utilities.py`:
- Register all five tools
- Group under "utilities" category

### 9.4 Verification Steps

1. Verify tools are registered:
   ```
   python -c "
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.utilities

   print('Utility tools:')
   for name in default_registry.list_names():
       if name in ['read_file', 'write_file', 'glob_files', 'grep_content', 'get_file_info']:
           print(f'  - {name}')
   "
   ```
   Expected: Shows all 5 utility tools

2. Test file reading:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.utilities

   async def test():
       tool = default_registry.get('read_file')
       result = await tool.handler({'path': '/tmp/test_workspace/test.data'})
       print(f'Read {len(result)} characters')

   asyncio.run(test())
   "
   ```
   Expected: Successfully reads file

3. Test glob:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.utilities

   async def test():
       tool = default_registry.get('glob_files')
       result = await tool.handler({
           'pattern': '*.py',
           'directory': 'campaign_builder'
       })
       print(result)

   asyncio.run(test())
   "
   ```
   Expected: Lists Python files

4. Test path safety:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.registry import default_registry
   import campaign_builder.agent.tools.utilities

   async def test():
       tool = default_registry.get('read_file')
       result = await tool.handler({'path': '/etc/passwd'})
       print(result)

   asyncio.run(test())
   "
   ```
   Expected: Returns error about restricted path

5. Run utility tool tests:
   ```
   pytest tests/test_tools_utilities_registered.py -v
   ```
   Expected: All tests pass

### 9.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/tools/utilities.py` | Created | Utility tool wrappers |
| `tests/test_tools_utilities_registered.py` | Created | Registration tests |

---

## Phase 3 Completion Checklist

Before moving to Phase 4, verify:

- [ ] Document tools (3) are registered and working
- [ ] Validation tools (6) are registered and working
- [ ] Utility tools (5) are registered and working
- [ ] All tools have proper error handling
- [ ] All tools format output for LLM consumption
- [ ] Path safety is enforced for file operations
- [ ] Tool registry contains all 14 tools
- [ ] All tool tests pass
- [ ] Tools work with all three adapters

---

## Next Document

Continue to [05-agents.md](./05-agents.md) for Thrusts 10-11: Integrating LLM into FileAnalyzer and CampaignPlanner.
