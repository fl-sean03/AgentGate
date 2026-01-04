# Document Reading Tools

This file contains Thrusts 4-5: PDF, Excel, and CSV reading tools implementation.

---

## Thrust 4: PDF Reading Tool

### 4.1 Objective

Implement a robust PDF text extraction tool that handles various PDF types and sizes.

### 4.2 Background

PDF documents in computational chemistry contexts include:
- Research papers with methodology and parameters
- Manuals and documentation
- Data sheets with force field values
- Reference materials

The tool must extract text while handling:
- Multi-page documents
- Different PDF encodings
- Scanned vs searchable PDFs
- Size limits for context management

### 4.3 Subtasks

#### 4.3.1 Create read_pdf Function Signature

In `campaign_builder/tools/documents.py`:

```python
def read_pdf(
    path: Union[str, Path],
    pages: Optional[str] = None,
    max_chars: int = 50000
) -> Dict[str, Any]
```

**Parameters:**
- `path`: Path to PDF file (required)
- `pages`: Page range like "1-5" or "1,3,7" (optional)
- `max_chars`: Maximum characters to return (default 50000)

**Returns dict with:**
- `page_count`: Total pages in document
- `title`: Document title from metadata (or None)
- `text`: Extracted text content
- `extraction_quality`: "high", "medium", or "low"
- `truncated`: Boolean if text was truncated
- `error`: Error message if failed (or None)

#### 4.3.2 Implement PDF Opening

Use PyMuPDF (fitz) to open PDF:

**Steps:**
1. Validate file exists
2. Check file extension is .pdf
3. Open with fitz.open()
4. Handle password-protected PDFs gracefully
5. Get page count from document

**Error handling:**
- File not found → return error dict
- Invalid PDF → return error dict
- Password protected → return error dict with specific message

#### 4.3.3 Implement Page Range Parsing

Parse the `pages` parameter:

**Input formats:**
- None → all pages
- "5" → page 5 only
- "1-10" → pages 1 through 10
- "1,3,5" → pages 1, 3, and 5
- "1-5,10,15-20" → combination

**Output:** List of 0-indexed page numbers

**Validation:**
- Page numbers must be positive integers
- Range start must be <= end
- Page numbers must be <= document page count
- Invalid format → use all pages with warning

#### 4.3.4 Implement Text Extraction

Extract text from selected pages:

**For each page:**
1. Get page object from document
2. Extract text using `page.get_text("text")`
3. Add page marker: "\n--- Page N ---\n"
4. Append to content string
5. Check against max_chars limit
6. Stop if limit reached

**Quality assessment:**
- High: Average >100 chars per page
- Medium: Average 20-100 chars per page
- Low: Average <20 chars per page (likely scanned)

#### 4.3.5 Implement Truncation

If content exceeds max_chars:

1. Truncate at max_chars boundary
2. Find last complete sentence (period followed by space or newline)
3. Add truncation notice: "\n\n[... Content truncated at {max_chars} characters ...]"
4. Set `truncated: True` in response

#### 4.3.6 Implement Metadata Extraction

Extract document metadata:

**From PDF metadata:**
- Title (if available)
- Author (if available)
- Subject (if available)
- Creator (if available)
- Creation date (if available)

**From first page (fallback for title):**
- First large text block (potential title)
- Only use if metadata title is empty

#### 4.3.7 Handle Edge Cases

**Empty PDF:**
- Return with text: "" and page_count: 0
- extraction_quality: "low"

**Image-only PDF (scanned):**
- Return with minimal text extracted
- extraction_quality: "low"
- Include warning in response

**Corrupted PDF:**
- Return error dict
- Specific error message about corruption

#### 4.3.8 Add Type Checking and Validation

Before processing:
1. Convert path to Path object
2. Check file exists
3. Check file is not empty
4. Check extension is .pdf
5. Check file size < 100MB

### 4.4 Verification Steps

1. **Basic extraction works:**
   - [ ] Opens valid PDF
   - [ ] Returns correct page_count
   - [ ] Extracts text content
   - [ ] Returns extraction_quality

2. **Page range works:**
   - [ ] "1-5" returns 5 pages
   - [ ] "1,3,5" returns 3 pages
   - [ ] Invalid range handled gracefully

3. **Truncation works:**
   - [ ] Respects max_chars limit
   - [ ] Truncates at sentence boundary
   - [ ] Sets truncated flag

4. **Error handling works:**
   - [ ] File not found → error response
   - [ ] Invalid PDF → error response
   - [ ] Empty PDF → empty text response

5. **Quality assessment works:**
   - [ ] Searchable PDF → "high"
   - [ ] Mixed PDF → "medium"
   - [ ] Scanned PDF → "low"

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/tools/documents.py` | Modified | Add read_pdf function |
| `tests/test_tools.py` | Modified | Add PDF reading tests |
| `tests/fixtures/sample.pdf` | Created | Test PDF file |

---

## Thrust 5: Excel and CSV Reading Tools

### 5.1 Objective

Implement tools for reading spreadsheet data in formats commonly used for force field parameters.

### 5.2 Background

Excel and CSV files in computational chemistry contain:
- Force field parameter tables (epsilon, sigma values)
- Atom type definitions
- Molecular property data
- Experimental reference data

The tools must:
- Handle multiple sheets (Excel)
- Auto-detect delimiters (CSV)
- Format data for LLM consumption
- Infer column types

### 5.3 Subtasks

#### 5.3.1 Create read_excel Function Signature

```python
def read_excel(
    path: Union[str, Path],
    sheet: Optional[Union[str, int]] = None,
    max_rows: int = 100
) -> Dict[str, Any]
```

**Parameters:**
- `path`: Path to Excel file (required)
- `sheet`: Sheet name or 0-based index (optional, default first)
- `max_rows`: Maximum data rows to return (default 100)

**Returns dict with:**
- `sheets`: List of all sheet names
- `current_sheet`: Which sheet was read
- `columns`: List of column headers
- `row_count`: Total rows in sheet
- `data`: Formatted text table
- `column_types`: Dict mapping column name to inferred type
- `truncated`: Boolean if rows were truncated
- `error`: Error message if failed

#### 5.3.2 Implement Excel Opening

Use openpyxl to open Excel files:

**Steps:**
1. Validate file exists
2. Check extension is .xlsx or .xls
3. Open workbook with openpyxl.load_workbook()
4. Get list of sheet names
5. Select target sheet

**For .xls files:**
- Use pandas with xlrd engine as fallback
- Or return error suggesting conversion

**Sheet selection:**
- None → first sheet
- String → sheet by name (case-insensitive match)
- Integer → sheet by index
- Invalid → error with available sheets listed

#### 5.3.3 Implement Excel Data Extraction

Read data from selected sheet:

**Steps:**
1. Get sheet object
2. Find header row (first row with data)
3. Extract column headers
4. Count total data rows
5. Read up to max_rows of data
6. Handle merged cells (use first value)
7. Handle empty cells (use empty string)

**Column header detection:**
- Use first non-empty row as headers
- If first row is empty, use column letters (A, B, C...)

#### 5.3.4 Implement Column Type Inference

For each column, determine data type:

**Types to detect:**
- "numeric": All values are numbers
- "text": All values are strings
- "mixed": Combination of types
- "empty": No data in column
- "date": Date/datetime values

**Detection logic:**
1. Sample first 20 non-empty values
2. Check if all can be parsed as numbers
3. Check if all match date patterns
4. Default to "text" if mixed

#### 5.3.5 Implement Text Table Formatting

Format data as readable text table:

**Format:**
```
| Column1 | Column2 | Column3 |
|---------|---------|---------|
| value1  | value2  | value3  |
| value4  | value5  | value6  |
```

**Formatting rules:**
- Align columns based on content width
- Truncate long values with "..."
- Maximum column width: 30 characters
- Use markdown table format for LLM readability

#### 5.3.6 Create read_csv Function Signature

```python
def read_csv(
    path: Union[str, Path],
    delimiter: Optional[str] = None,
    max_rows: int = 100
) -> Dict[str, Any]
```

**Parameters:**
- `path`: Path to CSV file (required)
- `delimiter`: Field separator (optional, auto-detect)
- `max_rows`: Maximum rows to return (default 100)

**Returns dict with:**
- `columns`: List of column headers
- `row_count`: Total rows
- `data`: Formatted text table
- `column_types`: Dict of column types
- `delimiter_used`: Detected/used delimiter
- `truncated`: Boolean if truncated
- `error`: Error message if failed

#### 5.3.7 Implement Delimiter Detection

Auto-detect CSV delimiter:

**Detection logic:**
1. Read first 5 lines of file
2. Try common delimiters: comma, tab, semicolon, pipe
3. For each delimiter, count fields per line
4. Choose delimiter with most consistent field count
5. Prefer comma if tie

**Common delimiters:**
- `,` (comma) - standard CSV
- `\t` (tab) - TSV files
- `;` (semicolon) - European CSV
- `|` (pipe) - some data exports
- ` ` (space) - whitespace separated

#### 5.3.8 Implement CSV Reading

Use Python's csv module:

**Steps:**
1. Open file with detected encoding
2. Create csv.reader with detected delimiter
3. Read header row
4. Read up to max_rows of data
5. Apply same formatting as Excel

**Encoding handling:**
- Try UTF-8 first
- Fall back to latin-1 if UTF-8 fails
- Handle BOM (byte order mark) for Excel-exported CSVs

#### 5.3.9 Implement Numeric Range Detection

For numeric columns, compute ranges:

**For each numeric column:**
- `min`: Minimum value
- `max`: Maximum value
- `mean`: Average value (optional)

**Return as:**
```python
{
    "column_name": {"min": 0.0, "max": 100.0}
}
```

#### 5.3.10 Implement Data Purpose Inference

Make educated guess about data purpose:

**Pattern matching:**
- Columns named "epsilon", "sigma" → "force_field_parameters"
- Columns named "mass", "element" → "atom_types"
- Columns named "x", "y", "z" → "coordinates"
- Columns named "temp", "temperature" → "simulation_conditions"
- Default: "tabular_data"

### 5.4 Verification Steps

1. **Excel reading works:**
   - [ ] Opens .xlsx files
   - [ ] Lists all sheets
   - [ ] Reads specified sheet
   - [ ] Extracts column headers
   - [ ] Formats data as table

2. **Excel edge cases:**
   - [ ] Handles empty cells
   - [ ] Handles merged cells
   - [ ] Handles large files
   - [ ] Respects max_rows

3. **CSV reading works:**
   - [ ] Opens .csv files
   - [ ] Auto-detects delimiter
   - [ ] Reads specified delimiter
   - [ ] Extracts headers
   - [ ] Formats as table

4. **CSV edge cases:**
   - [ ] Handles quoted fields
   - [ ] Handles newlines in fields
   - [ ] Handles different encodings
   - [ ] Handles empty files

5. **Type inference works:**
   - [ ] Numeric columns detected
   - [ ] Text columns detected
   - [ ] Mixed columns detected
   - [ ] Ranges computed for numeric

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/tools/documents.py` | Modified | Add read_excel, read_csv |
| `campaign_builder/tools/__init__.py` | Modified | Export functions |
| `tests/test_tools.py` | Modified | Add spreadsheet tests |
| `tests/fixtures/sample.xlsx` | Created | Test Excel file |
| `tests/fixtures/sample.csv` | Created | Test CSV file |

---

## Implementation Notes

### Error Response Format

All document tools return error in consistent format:

```python
{
    "error": "Descriptive error message",
    "error_code": "E1XX"  # From error taxonomy
}
```

### Memory Management

For large files:
- Don't load entire file into memory at once
- Use streaming/iterative reading where possible
- Set reasonable limits (100MB for Excel, 50MB for CSV)

### Character Encoding

Common encodings to try:
1. UTF-8 (most common)
2. UTF-8 with BOM
3. Latin-1 (Windows-1252)
4. ASCII

### Test Fixtures

Create realistic test files:
- sample.pdf: 3-page document with extractable text
- sample.xlsx: 2 sheets, 50 rows, various data types
- sample.csv: Comma-separated, 20 rows, force field parameters

### Next Thrust

After completing Thrusts 4-5, proceed to [05-tools-validation.md](./05-tools-validation.md) for the validation pipeline implementation.
