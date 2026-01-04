# Campaign Builder

An agent-based system for building simulation campaigns with LLM support.

## Features

- **FileAnalyzer**: Analyzes simulation files (LAMMPS, QE) and produces FileGuides
- **CampaignPlanner**: Generates simulation input files from natural language intent
- **Validation Pipeline**: L0-L3 validation for generated files
- **Provider Abstraction**: Works with Claude SDK, raw Anthropic API, or mock for testing

## Installation

```bash
pip install -e ".[dev]"
```

## Usage

```bash
# Analyze files in a workspace
campaign-builder analyze ./workspace

# Generate simulation inputs
campaign-builder generate ./workspace "NVT equilibration at 300K"

# Validate generated files
campaign-builder validate ./output/in.nvt
```

## Configuration

Set environment variables or create a `.env` file:

```bash
ANTHROPIC_API_KEY=your-api-key
AGENT_PROVIDER=anthropic  # or claude_sdk, mock
CLAUDE_MODEL=claude-sonnet-4-20250514
```
