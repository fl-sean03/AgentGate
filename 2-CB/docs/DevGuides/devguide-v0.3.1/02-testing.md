# DevGuide v0.3.1: Testing Infrastructure

**Thrusts 1-2: Real API Verification and Dependency Handling**

---

## Thrust 1: Real API Verification Suite

### 1.1 Objective

Create a dedicated test suite that verifies all agent functionality with real Anthropic API calls.

### 1.2 Background

Currently, real API tests are run ad-hoc during development. A proper test suite should:
- Be skipped automatically in CI (no API key)
- Run on-demand with a specific marker
- Verify complete end-to-end functionality
- Document expected behavior

### 1.3 Subtasks

#### 1.3.1 Create test file with skip marker

Create `tests/test_api_live.py` with proper pytest markers:
- Use `@pytest.mark.live_api` for all tests
- Add skip condition if ANTHROPIC_API_KEY not set
- Group tests by functionality

#### 1.3.2 Implement basic API tests

Test cases to implement:

**test_basic_query**
- Send simple math query (42+58)
- Verify response contains "100"
- Verify usage statistics returned

**test_tool_calling**
- Define a multiply tool
- Send query requiring tool use
- Verify tool was called with correct arguments
- Verify tool output in response

**test_multi_turn_conversation**
- Send initial query
- Send follow-up referencing previous answer
- Verify context maintained

#### 1.3.3 Implement LLM component tests

**test_llm_file_analyzer**
- Analyze a known LAMMPS data file
- Verify response mentions key features (atom types, box size, water model)
- Verify analysis success flag

**test_llm_campaign_planner**
- Provide file guide and intent
- Verify intent analysis returned
- Verify response contains relevant content

#### 1.3.4 Implement reliability tests

**test_resilient_provider**
- Wrap provider with ResilientProvider
- Verify normal operation works
- Test retry behavior (may need mock for failure simulation)

**test_provider_chain**
- Create chain with mock fallback
- Verify primary provider used when available

#### 1.3.5 Add pytest configuration

Update `pyproject.toml` or `conftest.py`:
- Register `live_api` marker
- Add command line option to run live tests
- Default to skipping live tests

### 1.4 Verification Steps

1. Run tests without API key:
   ```bash
   ANTHROPIC_API_KEY= pytest tests/test_api_live.py -v
   ```
   Expected: All tests skipped

2. Run tests with API key:
   ```bash
   pytest tests/test_api_live.py -v
   ```
   Expected: All tests pass

3. Run specific test:
   ```bash
   pytest tests/test_api_live.py::test_basic_query -v
   ```
   Expected: Single test passes

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/test_api_live.py` | Created | Live API test suite |
| `tests/conftest.py` | Modified | Add live_api marker |
| `pyproject.toml` | Modified | Register marker |

---

## Thrust 2: Optional Dependency Handling

### 2.1 Objective

Fix test failures caused by missing optional dependencies (PyMuPDF, openpyxl) and ensure graceful degradation.

### 2.2 Background

5 PDF-related tests fail when PyMuPDF is not installed:
- Tests expect specific error messages ("not found", "empty")
- Actually get "PyMuPDF not installed" error
- Need to either skip tests or adjust assertions

### 2.3 Subtasks

#### 2.3.1 Add dependency check utilities

Create helper functions in `campaign_builder/utils/deps.py`:

**check_pdf_available() -> bool**
- Try importing fitz (PyMuPDF)
- Return True if available, False otherwise

**check_excel_available() -> bool**
- Try importing openpyxl
- Return True if available, False otherwise

#### 2.3.2 Update PDF tests

Modify `tests/test_tools_documents.py`:
- Add `@pytest.mark.skipif(not check_pdf_available(), reason="PyMuPDF not installed")`
- Or adjust assertions to accept "not installed" error message
- Prefer skipif for clarity

#### 2.3.3 Update Excel tests if needed

Check if any Excel tests have similar issues and fix accordingly.

#### 2.3.4 Document optional dependencies

Update README or docs to clarify:
- Core functionality requires: anthropic, pydantic, python-dotenv
- PDF reading requires: PyMuPDF (fitz)
- Excel reading requires: openpyxl
- Installation commands for each

### 2.4 Verification Steps

1. Run tests without optional deps:
   ```bash
   pip uninstall pymupdf openpyxl -y
   pytest tests/test_tools_documents.py -v
   ```
   Expected: PDF/Excel tests skipped, others pass

2. Run tests with optional deps:
   ```bash
   pip install pymupdf openpyxl
   pytest tests/test_tools_documents.py -v
   ```
   Expected: All tests pass

3. Verify full test suite:
   ```bash
   pytest tests/ -v --tb=short
   ```
   Expected: 0 failures (all pass or skip appropriately)

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/utils/deps.py` | Created | Dependency check utilities |
| `tests/test_tools_documents.py` | Modified | Add skip conditions |
| `docs/installation.md` | Modified | Document optional deps |

---

## Phase 1 Completion Checklist

Before moving to Phase 2, verify:

- [ ] `tests/test_api_live.py` created with 6+ test functions
- [ ] Tests skip properly when no API key
- [ ] Tests pass when API key present
- [ ] PDF tests skip when PyMuPDF missing
- [ ] Excel tests skip when openpyxl missing
- [ ] Full test suite runs with 0 failures

---

## Next Document

Continue to [03-validation.md](./03-validation.md) for Thrusts 3-4: Validation integration.
