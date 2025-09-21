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
- **Rich Features**: Advanced acolyte capabilities for teams wanting deeper integration
- **Smart Analysis**: File-aware acolytes with context understanding
- **Workflow Integration**: Git, CI/CD, and IDE integrations
- **Team Coordination**: Shared configurations and learning from team patterns

Both modes use the same core acolyte system but offer different levels of functionality based on your needs.

## Core Problem

Claude Code operates with limited context windows and cannot examine all files when making decisions. This leads to:
- Changes that conflict with existing code patterns
- Violations of established architecture principles
- Breaking changes that aren't caught until runtime
- Inconsistent code style across the project

## Solution Architecture

### 1. Hook-Based Interception

COMA uses Claude Code's hook system to intercept operations before they execute:

```javascript
PreToolUse: [
  {
    matcher: "Edit|MultiEdit|Write|Bash",
    hooks: [{ type: "command", command: "coma-validator.js" }]
  }
]
```

**Intercepted Operations:**
- `Edit`: File modifications
- `MultiEdit`: Batch file changes
- `Write`: New file creation
- `Bash`: Shell commands (can affect any file)

### 2. Acolyte System

Each file in the repository gets a dedicated AI "acolyte" that:
- Understands the file's purpose and patterns
- Acts as the "key stakeholder" for that file
- Validates proposed changes against the file's context

**Acolyte Creation Process:**
1. Repository scan identifies all relevant files
2. Each file gets analyzed for its role and patterns
3. Acolyte configurations are generated with file-specific context
4. Acolytes are stored in temporary configuration files

### 3. Provider Architecture

COMA supports multiple AI providers for acolyte consultation:

#### Claude Code Provider
- Spawns parallel Claude sessions for each acolyte
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
PostToolUse: ["capture all tool results"]
UserPromptSubmit: ["capture conversation flow"]
```

**Context Storage:**
- Stored in environment variables (`COMA_CONTEXT_0` through `COMA_CONTEXT_4`)
- Last 5 Claude responses captured
- Messages truncated to 2000 characters to avoid bloat
- No file I/O required (faster, cleaner)

### 5. Parallel Consultation Process

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
   - For specific files: Only relevant file acolytes
   - For Bash commands: All acolytes (any file could be affected)

3. **Parallel Consultation**
   ```javascript
   const promises = acolytes.map(acolyte =>
     provider.consultAcolyte(acolyte, enhancedToolData)
   );
   const results = await Promise.all(promises);
   ```

4. **Consensus Evaluation**
   - Any `REJECT` → Operation blocked
   - Any `NEEDS_CONTEXT` → Operation blocked
   - Any `ERROR` → Operation blocked
   - All `APPROVE` → Operation allowed

## Decision Process Flow

```
Claude wants to edit file.js
         ↓
PreToolUse hook fires
         ↓
COMA captures recent Claude context
         ↓
COMA identifies affected files
         ↓
COMA loads relevant acolytes
         ↓
[Parallel] Each acolyte analyzes:
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
- Defines acolyte role and responsibilities
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
├── claude-coma.js           # Main launcher, settings management
├── coma-validator.js        # Central validation coordinator
├── context-manager.js       # Context capture and storage
├── context-capturer.js      # Hook-based context collection
├── prompts/
│   └── base.md             # Acolyte prompt template
└── providers/
    ├── claude-code.js      # Claude Code provider implementation
    └── openai.js           # OpenAI provider implementation
```

## Security Considerations

### Acolyte Isolation
- Claude Code acolytes run with restricted tool access
- Only read-only operations permitted: `Read,Grep,Glob,WebFetch,WebSearch`
- No `Edit,Write,Bash` access prevents acolyte interference

### Context Sanitization
- Messages truncated to prevent prompt injection
- Environment variables cleared on session end
- No persistent storage of sensitive information

### Consensus Requirement
- Unanimous approval required for operations
- Any single rejection blocks the entire operation
- Conservative approach prioritizes safety over convenience

## Performance Characteristics

### Parallel Processing
- All acolytes consult simultaneously (3-10 seconds typical)
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

### Prompt Customization
Users can edit `src/prompts/base.md` to:
- Adjust acolyte behavior
- Add project-specific guidelines
- Modify decision criteria
- Include custom validation rules

### Environment Variables
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
- Added latency before each operation (3-10 seconds)
- Increased API usage for provider calls
- Memory usage for parallel acolyte sessions

### Coverage Limitations
- Only covers modification operations
- Read operations are not validated
- Some edge cases may not be caught

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
- Caching of acolyte decisions
- Incremental validation for large changes
- Smart acolyte selection based on change analysis