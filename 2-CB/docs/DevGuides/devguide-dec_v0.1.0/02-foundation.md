# Project Foundation

This file contains Thrust 1: Setting up the Campaign Builder project from scratch.

---

## Thrust 1: Project Foundation

### 1.1 Objective

Create a complete, installable Python package structure with all dependencies configured and verified working.

### 1.2 Background

Campaign Builder is a Python package built on the Claude Agent SDK. The project follows modern Python packaging conventions using `pyproject.toml`. The directory structure mirrors the multi-agent architecture with clear separation between agents, tools, schemas, and utilities.

### 1.3 Subtasks

#### 1.3.1 Create Root Project Directory

Create the main project directory within the repository. This becomes the working directory for all subsequent development.

**Location:** Create at repository root level alongside `/docs/`

**Directory name:** `campaign-builder/` (with hyphen for the root, underscore for the package)

#### 1.3.2 Create Package Directory Structure

Create the complete directory tree for the Python package:

```
campaign-builder/
├── campaign_builder/
│   ├── __init__.py
│   ├── cli.py
│   │
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── file_analyzer.py
│   │   ├── campaign_planner.py
│   │   ├── runner.py
│   │   └── prompts.py
│   │
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── documents.py
│   │   └── validation.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── file_guide.py
│   │   └── errors.py
│   │
│   └── utils/
│       ├── __init__.py
│       └── hashing.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_schemas.py
│   ├── test_tools.py
│   ├── test_file_analyzer.py
│   ├── test_campaign_planner.py
│   ├── test_runner.py
│   └── fixtures/
│       └── .gitkeep
│
├── pyproject.toml
├── README.md
├── .env.example
└── .gitignore
```

**Create each directory and file.** Empty files are acceptable at this stage - they establish the structure.

#### 1.3.3 Create pyproject.toml

The project configuration file using modern Python packaging standards.

**Required sections:**

**[project] section:**
- name: "campaign-builder"
- version: "0.1.0"
- description: "AI-powered simulation campaign builder for computational chemistry"
- requires-python: ">=3.10"
- dependencies (list all production dependencies):
  - claude-agent-sdk
  - click
  - python-dotenv
  - pymupdf
  - openpyxl
  - pandas

**[project.optional-dependencies] section:**
- dev dependencies:
  - pytest
  - pytest-asyncio
  - ruff

**[project.scripts] section:**
- campaign-builder entry point pointing to `campaign_builder.cli:main`

**[tool.ruff] section:**
- line-length: 100
- target-version: "py310"

**[tool.pytest.ini_options] section:**
- asyncio_mode: "auto"
- testpaths: ["tests"]

#### 1.3.4 Create Root __init__.py

The main package `__init__.py` should:
- Define `__version__ = "0.1.0"`
- Import key classes for convenient access (after they exist)

Initially, just include the version string.

#### 1.3.5 Create Module __init__.py Files

Each subpackage needs an `__init__.py`:

**campaign_builder/agent/__init__.py:**
- Will export: `analyze_file`, `analyze_all_files`, `run_campaign_planner`, `run_campaign_builder`
- Initially: empty or just a docstring

**campaign_builder/tools/__init__.py:**
- Will export: `read_pdf`, `read_excel`, `read_csv`, `validate_deck`
- Initially: empty or just a docstring

**campaign_builder/schemas/__init__.py:**
- Will export: `FileGuide`, `FileType`, `CampaignError`, `ErrorHandler`
- Initially: empty or just a docstring

**campaign_builder/utils/__init__.py:**
- Will export: `compute_file_hash`
- Initially: empty or just a docstring

#### 1.3.6 Create Placeholder Module Files

Create empty placeholder files for each module. Each should have:
- Module docstring describing its purpose
- Any obvious imports that will be needed

**campaign_builder/cli.py:**
```
"""Command-line interface for Campaign Builder."""
```

**campaign_builder/agent/file_analyzer.py:**
```
"""FileAnalyzer sub-agent for intelligent file analysis."""
```

**campaign_builder/agent/campaign_planner.py:**
```
"""Campaign Planner agent for deck generation."""
```

**campaign_builder/agent/runner.py:**
```
"""Main orchestration runner for Campaign Builder."""
```

**campaign_builder/agent/prompts.py:**
```
"""System prompts for all Campaign Builder agents."""
```

**campaign_builder/tools/documents.py:**
```
"""Custom tools for reading PDF and spreadsheet documents."""
```

**campaign_builder/tools/validation.py:**
```
"""L0-L3 validation pipeline for generated input decks."""
```

**campaign_builder/schemas/file_guide.py:**
```
"""FileGuide dataclass and FileType enumeration."""
```

**campaign_builder/schemas/errors.py:**
```
"""Error types, severity levels, and error handling."""
```

**campaign_builder/utils/hashing.py:**
```
"""File hashing utilities for provenance tracking."""
```

#### 1.3.7 Create .gitignore

Essential patterns to exclude:

```
# Byte-compiled files
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
.venv/
venv/
ENV/

# Environment files
.env

# IDE
.idea/
.vscode/
*.swp
*.swo

# Distribution
dist/
build/
*.egg-info/

# Testing
.pytest_cache/
.coverage
htmlcov/

# OS files
.DS_Store
Thumbs.db
```

#### 1.3.8 Create .env.example

Template for required environment variables:

```
# Anthropic API Key (required)
ANTHROPIC_API_KEY=your-api-key-here

# Optional: Paths to simulation engines for L2 validation
LAMMPS_PATH=lmp
QE_PATH=pw.x

# Optional: Configuration
CB_MAX_FILE_SIZE=500000000
CB_TIMEOUT=120
```

#### 1.3.9 Create README.md

A brief README for the package (separate from the greenfield docs):

**Include:**
- Package name and one-line description
- Installation instructions (pip install -e .)
- Basic usage example
- Link to main documentation in /docs/greenfield/
- License information

#### 1.3.10 Create tests/conftest.py

Pytest configuration and shared fixtures:

**Include:**
- pytest fixture for temporary workspace directory
- pytest fixture for sample file paths (to be added later)
- Any shared test utilities

#### 1.3.11 Create Test Placeholder Files

Create empty test files with module docstrings:

**tests/test_schemas.py:**
```
"""Tests for FileGuide, FileType, and error handling."""
```

**tests/test_tools.py:**
```
"""Tests for document reading and validation tools."""
```

**tests/test_file_analyzer.py:**
```
"""Tests for FileAnalyzer sub-agent."""
```

**tests/test_campaign_planner.py:**
```
"""Tests for Campaign Planner agent."""
```

**tests/test_runner.py:**
```
"""Tests for orchestration runner."""
```

#### 1.3.12 Install Package in Editable Mode

Execute the following commands:

1. Create virtual environment: `python -m venv .venv`
2. Activate: `source .venv/bin/activate` (Linux/Mac) or `.venv\Scripts\activate` (Windows)
3. Install in editable mode: `pip install -e ".[dev]"`

Verify installation succeeds without errors.

#### 1.3.13 Verify Package Imports

Test that the package is importable:

```python
from campaign_builder import __version__
print(f"Campaign Builder v{__version__}")
```

This should print "Campaign Builder v0.1.0" without errors.

#### 1.3.14 Verify CLI Entry Point

Test that the CLI entry point is registered:

```bash
campaign-builder --help
```

This will fail initially (no main function), but should show "campaign-builder" is recognized.

#### 1.3.15 Run Empty Test Suite

Verify pytest is configured:

```bash
pytest
```

Should report "0 tests collected" without errors.

### 1.4 Verification Steps

1. **Directory structure exists:**
   - [ ] `campaign-builder/` directory created
   - [ ] `campaign_builder/` package with all subdirectories
   - [ ] `tests/` directory with fixtures subdirectory
   - [ ] All `__init__.py` files present

2. **Configuration files exist:**
   - [ ] `pyproject.toml` with all sections
   - [ ] `.gitignore` with appropriate patterns
   - [ ] `.env.example` with template variables
   - [ ] `README.md` with basic content

3. **Package installs:**
   - [ ] `pip install -e ".[dev]"` completes successfully
   - [ ] All dependencies resolve

4. **Package imports:**
   - [ ] `from campaign_builder import __version__` works
   - [ ] Returns "0.1.0"

5. **Test framework works:**
   - [ ] `pytest` runs without errors
   - [ ] Reports "0 tests collected"

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign-builder/` | Created | Root project directory |
| `campaign_builder/__init__.py` | Created | Package with version |
| `campaign_builder/cli.py` | Created | CLI placeholder |
| `campaign_builder/agent/__init__.py` | Created | Agent subpackage |
| `campaign_builder/agent/file_analyzer.py` | Created | FileAnalyzer placeholder |
| `campaign_builder/agent/campaign_planner.py` | Created | Campaign Planner placeholder |
| `campaign_builder/agent/runner.py` | Created | Runner placeholder |
| `campaign_builder/agent/prompts.py` | Created | Prompts placeholder |
| `campaign_builder/tools/__init__.py` | Created | Tools subpackage |
| `campaign_builder/tools/documents.py` | Created | Document tools placeholder |
| `campaign_builder/tools/validation.py` | Created | Validation placeholder |
| `campaign_builder/schemas/__init__.py` | Created | Schemas subpackage |
| `campaign_builder/schemas/file_guide.py` | Created | FileGuide placeholder |
| `campaign_builder/schemas/errors.py` | Created | Errors placeholder |
| `campaign_builder/utils/__init__.py` | Created | Utils subpackage |
| `campaign_builder/utils/hashing.py` | Created | Hashing placeholder |
| `tests/__init__.py` | Created | Tests package |
| `tests/conftest.py` | Created | Pytest config |
| `tests/test_*.py` | Created | Test placeholders |
| `tests/fixtures/.gitkeep` | Created | Keep fixtures dir |
| `pyproject.toml` | Created | Project config |
| `.gitignore` | Created | Git ignore patterns |
| `.env.example` | Created | Env template |
| `README.md` | Created | Package readme |

---

## Implementation Notes

### Dependency Versions

While `pyproject.toml` doesn't require pinned versions, be aware of minimum versions:
- claude-agent-sdk: Use latest stable
- click: 8.0+
- pymupdf: 1.23+
- openpyxl: 3.1+
- pandas: 2.0+

### Virtual Environment

Always work within the virtual environment. The `.venv/` directory should be created inside `campaign-builder/` but excluded via `.gitignore`.

### API Key

The ANTHROPIC_API_KEY must be set for agents to work. Thrust 1 only sets up the structure - agent functionality comes later.

### Next Thrust

After completing Thrust 1, proceed to [03-schemas.md](./03-schemas.md) for Thrusts 2-3: FileType enumeration and FileGuide dataclass.
