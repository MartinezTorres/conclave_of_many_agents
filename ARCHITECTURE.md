# COMA Architecture & Internal Design

## Overview

The Conclave of Many Agents (COMA) is a sophisticated validation system that addresses Claude Code's context limitations through a multi-agent architecture. This document explains the internal workings, decision processes, and technical implementation.

## Vision

Claude-COMA is designed as a **dual-mode system** to serve different development needs:

### Simple Protective Wrapper (Core)
- **Easy Integration**: Drop-in protection for existing Claude Code workflows
- **Minimal Overhead**: Basic validation without changing development habits
- **Team Friendly**: Optional adoption - doesn't force workflows on teammates
- **Backward Compatible**: Works with any existing Claude Code setup

### Development Assistant Mode (Extended)
- **Rich Features**: Advanced agent capabilities for teams wanting deeper integration
- **Smart Analysis**: File-aware agents with context understanding
- **Workflow Integration**: Git, CI/CD, and IDE integrations
- **Team Coordination**: Shared configurations and learning from team patterns

Both modes use the same core agent system but offer different levels of functionality based on your needs.

## Core Problem

Claude Code operates with limited context windows and cannot examine all files when making decisions. This leads to:
- Changes that conflict with existing code patterns
- Violations of established architecture principles
- Breaking changes that aren't caught until runtime
- Inconsistent code style across the project

## Solution Architecture

**Updated Design (v2):** COMA now uses a **permanent hook installation** model with **transparent operation** when not actively running. This simplifies deployment and ensures perfect integration with other Claude Code tools.

### 1. Hook-Based Interception

COMA uses Claude Code's hook system to intercept operations before they execute:

```javascript
PreToolUse: [
  {
    matcher: "Edit|MultiEdit|Write|Bash",
    hooks: [{ type: "command", command: "node claude-coma.js hook PreToolUse" }]
  }
]
```

**New Architecture:** All hooks now route through `claude-coma` as the single entry point, which then delegates to appropriate handlers based on the `CLAUDE_COMA` environment variable.

**Intercepted Operations:**
- `Edit`: File modifications
- `MultiEdit`: Batch file changes
- `Write`: New file creation
- `Bash`: Shell commands (can affect any file)

### 2. Acolyte System

Each file in the repository gets a dedicated AI "agent" that:
- Understands the file's purpose and patterns
- Acts as the "key stakeholder" for that file
- Validates proposed changes against the file's context

**Acolyte Creation Process:**
1. Repository scan identifies all relevant files
2. Each file gets analyzed for its role and patterns
3. Acolyte configurations are generated with file-specific context
4. Acolytes are stored in temporary configuration files

### 3. Provider Architecture

COMA supports multiple AI providers for agent consultation:

#### Claude Code Provider
- Spawns parallel Claude sessions for each agent
- Uses `--allowed-tools Read,Grep,Glob,WebFetch,WebSearch` for read-only access
- Leverages full Claude capabilities for analysis
- No external API keys required

#### OpenAI Provider
- Uses direct OpenAI API calls (GPT-4o-mini)
- Faster for simple validation tasks
- Requires OPENAI_API_KEY environment variable
- More cost-effective for high-volume usage

### 4. Context Capture System

**The Challenge:** Claude Code hooks only receive tool parameters, not Claude's reasoning.

**The Solution:** Multi-hook context capture:

```javascript
PostToolUse: [{ command: "node claude-coma.js hook PostToolUse" }]
UserPromptSubmit: [{ command: "node claude-coma.js hook UserPromptSubmit" }]
```

**Context Storage:**
- Stored in environment variables (`COMA_CONTEXT_0` through `COMA_CONTEXT_4`)
- Last 5 Claude responses captured
- Messages truncated to 2000 characters to avoid bloat
- No file I/O required (faster, cleaner)

### 5. Debug Logging System

**New Feature:** Comprehensive debug logging for hook troubleshooting:

```bash
claude-coma --debug                    # Logs to .claude-coma.log
claude-coma --debug=/tmp/debug.log     # Logs to custom path
```

**Debug Architecture:**
- `CLAUDE_COMA_DEBUG` environment variable carries log path to all processes
- Atomic file appends prevent race conditions
- Structured format: `timestamp [pid] COMPONENT: message`
- Components: Main, VALIDATOR, CONTEXT for easy filtering

### 6. Parallel Consultation Process

When a tool use is intercepted:

1. **Context Assembly**
   ```javascript
   const enhancedToolData = {
     toolName: "Edit",
     parameters: { file_path: "...", old_string: "...", new_string: "..." },
     claudeContext: "Recent Claude responses..."
   };
   ```

2. **Acolyte Selection**
   - For specific files: Only relevant file agents
   - For Bash commands: All agents (any file could be affected)

3. **Parallel Consultation**
   ```javascript
   const promises = agents.map(agent =>
     provider.consultAgent(agent, enhancedToolData)
   );
   const results = await Promise.all(promises);
   ```

4. **Consensus Evaluation**
   - Any `REJECT` → Operation blocked
   - Any `ERROR` → Operation blocked
   - All `APPROVE` → Operation allowed

## Decision Process Flow

**Updated with Environment-Based Activation:**

```
Claude wants to edit file.js
         ↓
PreToolUse hook fires: "claude-coma hook PreToolUse"
         ↓
COMA checks CLAUDE_COMA environment variable
         ↓
If CLAUDE_COMA=1: Proceed with validation
If CLAUDE_COMA unset: Exit silently (transparent operation)
         ↓
COMA captures recent Claude context
         ↓
COMA identifies affected files
         ↓
COMA loads relevant agents
         ↓
[Parallel] Each agent analyzes:
  - Proposed change
  - Their file's context
  - Claude's recent reasoning
  - Repository patterns
         ↓
COMA evaluates consensus:
  - ANY rejection → BLOCK
  - ALL approvals → ALLOW
         ↓
Operation proceeds or is blocked
```

## Prompt Engineering

### Base Prompt Template
Located in `src/prompts/base.md`, this template:
- Defines agent role and responsibilities
- Includes file-specific context via `{{FILE_PATH}}`
- Provides analysis framework
- Specifies required response format

### Dynamic Context Injection
```javascript
const instruction = `${basePrompt}

CONTEXT FROM RECENT CLAUDE RESPONSES:
${toolData.claudeContext}

PROPOSED CHANGE:
Tool: ${toolData.toolName}
Parameters: ${JSON.stringify(toolData.parameters, null, 2)}`;
```

## File Organization

```
src/
├── claude-coma.js           # Main launcher, hook router, settings management, test runner
├── coma-validator.js        # Central validation coordinator
├── context-manager.js       # Context capture and storage
├── context-capturer.js      # Hook-based context collection
├── prompts/
│   └── base.md             # Acolyte prompt template
├── providers/
│   ├── claude-code.js      # Claude Code provider implementation
│   └── openai.js           # OpenAI provider implementation
test/
├── test-hook-management.js  # Hook installation and cleanup tests
├── test-consensus-logic.js  # Consensus evaluation tests
├── test-context-capture.js  # Context capture system tests
├── test-file-scanning.js    # Repository scanning tests
├── test-error-scenarios.js  # Error handling tests
├── test-providers.js # Provider interface tests
└── test-shakespeare-integration.cjs # End-to-end integration test
```

**Key Changes:**
- `claude-coma.js` now serves as the central hook router and test runner
- All hooks call `claude-coma hook <type>` for consistency
- Debug logging added to all components
- Comprehensive test suite integrated into main command

## Security Considerations

### Acolyte Isolation
- Claude Code agents run with restricted tool access
- Only read-only operations permitted: `Read,Grep,Glob,WebFetch,WebSearch`
- No `Edit,Write,Bash` access prevents agent interference

### Context Sanitization
- Messages truncated to prevent prompt injection
- Environment variables cleared on session end
- No persistent storage of sensitive information

### Consensus Requirement
- Unanimous approval required for operations
- Any single rejection blocks the entire operation
- Conservative approach prioritizes safety over convenience

### Transparent Operation
- Hooks installed permanently but only active when `CLAUDE_COMA=1`
- Perfect integration with other Claude Code tools
- No performance impact when COMA not running

## Performance Characteristics

### Parallel Processing
- All agents consult simultaneously (3-10 seconds typical)
- Much faster than sequential consultation (30+ seconds)
- Scales with number of CPU cores available

### Context Capture Overhead
- Minimal performance impact
- Environment variable storage is fast
- No file I/O during normal operation

### Provider Performance
- **Claude Code**: Slower startup, more thorough analysis
- **OpenAI**: Faster response, direct API calls

## Configuration & Customization

### Provider Selection
```bash
claude-coma --provider openai  # Use OpenAI provider
claude-coma                    # Use Claude Code provider (default)
```

### Debug Logging
```bash
claude-coma --debug                    # Enable debug logging
claude-coma --debug=/path/to/log       # Custom log path
```

### Testing System
```bash
claude-coma test                       # Run all tests
claude-coma test --unit                # Unit tests only
claude-coma test --integration         # Integration test only
claude-coma test --debug               # Tests with debug logging
```

**Test Architecture:**
- **Self-contained**: All tests run through the main `claude-coma` command
- **No executable files**: Tests are modules, not standalone scripts
- **Comprehensive coverage**: Unit tests for components, integration test for end-to-end functionality
- **Environment validation**: Integration test verifies actual hook triggering with real environment
- **ASCII output**: Clean, team-friendly test results without emojis
- **Isolated execution**: Each test runs in temporary directories with full cleanup

### Prompt Customization
Users can edit `src/prompts/base.md` to:
- Adjust agent behavior
- Add project-specific guidelines
- Modify decision criteria
- Include custom validation rules

### Environment Variables
- `CLAUDE_COMA`: Session activation flag (set to "1" when active)
- `CLAUDE_COMA_DEBUG`: Debug log file path (optional)
- `COMA_PROVIDER`: Provider selection
- `COMA_CONFIG_DIR`: Temporary configuration storage
- `COMA_REPO_PATH`: Repository root path
- `COMA_CONTEXT_N`: Captured Claude responses
- `OPENAI_API_KEY`: Required for OpenAI provider

## Limitations & Trade-offs

### Context Capture Limitations
- Hook system doesn't provide Claude's internal reasoning
- Must reconstruct intent from conversation history
- Limited to last 5 responses (environment variable size constraints)

### Performance Trade-offs
- Added latency before each operation (3-10 seconds) when COMA active
- Increased API usage for provider calls
- Memory usage for parallel agent sessions
- Zero performance impact when COMA not running

### Coverage Limitations
- Only covers modification operations
- Read operations are not validated
- Some edge cases may not be caught

### Hook Management
- Hooks installed permanently (no automatic cleanup)
- Manual removal required if COMA no longer wanted
- Settings merge rather than backup/restore approach

## Testing & Validation

### Integrated Test Suite
COMA includes a comprehensive test suite accessible via `claude-coma test`:

**Unit Tests (6 files):**
- Hook management: Installation, removal, settings manipulation
- Consensus logic: APPROVE/REJECT decision evaluation
- Context capture: Environment variable storage and retrieval
- File scanning: Repository traversal and ignore patterns
- Error scenarios: Network failures, invalid responses, edge cases
- Provider interfaces: Claude Code and OpenAI provider testing

**Integration Test:**
- End-to-end hook triggering simulation
- Environment-based activation testing (`CLAUDE_COMA=1` vs unset)
- Debug logging verification
- Temporary directory isolation
- Real command execution with process spawning

**Test Design Principles:**
- **No repository pollution**: All tests use temporary directories
- **ASCII-only output**: Clean, professional test results
- **Self-validation**: Tests verify their own environment setup
- **Comprehensive cleanup**: No test artifacts left behind
- **Real environment simulation**: Tests use actual file system and processes

### Validation Workflow
```
claude-coma test
    ↓
Unit Tests (components)
    ↓
Integration Test (end-to-end)
    ↓
Results Summary
```

## Future Considerations

### Enhanced Context
- Deeper integration with Claude Code's internal state
- Access to conversation history beyond last 5 responses
- Understanding of user intent and session goals

### Advanced Validation
- Static analysis integration
- Test execution before approval
- Rollback mechanisms for failed operations

### Performance Optimization
- Caching of agent decisions
- Incremental validation for large changes
- Smart agent selection based on change analysis