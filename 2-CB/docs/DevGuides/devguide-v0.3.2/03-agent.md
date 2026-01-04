# LLM Integration

## Thrust 3: Provider Setup

### 3.1 Objective
Create a minimal Anthropic provider with retry logic.

### 3.2 Subtasks

#### 3.2.1 Create AnthropicProvider Class
Create a simple provider class that:
- Initializes with API key from environment
- Supports async message creation
- Has built-in exponential backoff retry
- Returns structured response

#### 3.2.2 Implement Retry Logic
Add retry decorator/logic with:
- Maximum 3 retries
- Exponential backoff (1s, 2s, 4s)
- Retry on rate limit and transient errors
- Clear error messages on final failure

#### 3.2.3 Implement Message Creation
Create async method to:
- Accept system prompt and user message
- Optionally accept tools list
- Return response content as string
- Handle tool calls if present

#### 3.2.4 Add Health Check
Create method to verify provider connectivity:
- Simple "say OK" test
- Return boolean health status
- Log connection details

### 3.3 Verification Steps
1. Set `ANTHROPIC_API_KEY` environment variable
2. Run health check - should return True
3. Send test message - should get response
4. Verify retry on simulated rate limit

### 3.4 Files Modified
| File | Action |
|------|--------|
| `lammps_reaper/provider.py` | Modified - implement provider |

---

## Thrust 4: Generation Logic

### 4.1 Objective
Implement LAMMPS deck generation using LLM.

### 4.2 Subtasks

#### 4.2.1 Create System Prompt
Create LAMMPS-expert system prompt that:
- Establishes LLM as LAMMPS expert
- Specifies output format (raw LAMMPS input only)
- Lists common LAMMPS patterns and best practices
- Emphasizes production-ready output

#### 4.2.2 Implement Context Builder
Create function to build context from input files:
- Read each file and detect type
- Extract relevant content (truncate large files)
- Format as structured context string
- Include file type hints (data file, potential, etc.)

#### 4.2.3 Implement Prompt Builder
Create function to build the user prompt:
- Include user's intent
- Include file context if provided
- Add output format instructions
- Request complete, runnable deck

#### 4.2.4 Implement generate_deck Function
Create main generation function that:
- Takes ReaperInput
- Builds context and prompt
- Calls LLM provider
- Extracts deck content from response
- Runs validation pipeline
- Returns ReaperOutput

#### 4.2.5 Implement Post-Processing
Create function to clean LLM output:
- Remove markdown code fences if present
- Strip leading/trailing whitespace
- Normalize line endings
- Detect and handle partial outputs

### 4.3 Verification Steps
1. Generate deck for simple LJ simulation
2. Generated deck should be valid LAMMPS syntax
3. Generate deck with data file context
4. Generated deck should reference provided files

### 4.4 Files Modified
| File | Action |
|------|--------|
| `lammps_reaper/generator.py` | Modified - implement generation |

---

## Navigation

⬅️ **Previous**: [02-core.md](./02-core.md)
➡️ **Next**: [04-validation.md](./04-validation.md) — Validation Pipeline
