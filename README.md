# Conclave of Many Agents (COMA)

*"In the spirit of ancient wisdom, where many counselors bring safety to important decisions, the Conclave gathers AI agents as guardians of your code. Each file finds its devoted acolyte, each change faces its thoughtful review."*

When a single mind—even an AI mind—holds the weight of an entire codebase, important details slip through the cracks. That's why we summon a **conclave**: a deliberative assembly where **many agents** each hold deep knowledge of their domain, ensuring no change goes unexamined by those who understand it best.

**What it does**: The Conclave addresses Claude's context limitations by assigning dedicated AI "acolytes" to each file in your repository. When Claude wants to make changes, these file-specific acolytes validate that the proposed changes align with the existing code, architecture, and ideas already expressed in their assigned files.

**Why it's needed**: Claude Code has limited context and can't examine all files when making decisions. Each acolyte acts as the "key stakeholder" for their specific file, ensuring Claude's main agent doesn't make changes that conflict with established patterns or violate the design principles already present in the codebase.

**How to use**: Use `claude-coma` instead of `claude` to launch Claude Code with the Conclave of Many Agents protection active. You can still use `claude` normally in the same repository when you don't want the protection.

## How It Works

COMA assigns AI "acolytes" to each file in your repository. When Claude wants to make changes, these acolytes validate the proposed changes against their file's context and patterns. The system captures Claude's recent responses to provide reasoning context to the acolytes.

**For technical details**, see [ARCHITECTURE.md](ARCHITECTURE.md) which explains the internal design, decision processes, and implementation details.

## Installation

```bash
npm install -g .
```

## Usage

```bash
# Run Claude with acolyte protection (default: Claude Code acolytes)
claude-coma

# Run Claude with OpenAI acolytes
claude-coma --provider openai

# Run with debug logging
claude-coma --debug

# Run test suite
claude-coma test

# Show hook removal instructions
claude-coma cleanup
```

## Commands

1. **claude-coma** (default):
   - Auto-installs hooks in ~/.claude/settings.json if needed
   - Scans repository and creates acolyte configs
   - Launches Claude Code with protection active

2. **claude-coma test**:
   - Runs comprehensive test suite
   - Validates hook installation and triggering
   - Tests acolyte consultation process
   - Verifies debug logging functionality

3. **claude-coma cleanup**:
   - Shows instructions for removing COMA hooks
   - Lists hook locations and removal steps

## What Gets Protected

- Edit operations
- MultiEdit operations
- Write operations
- Bash commands

## Testing

COMA includes a comprehensive test suite accessible via the `test` subcommand:

```bash
# Run all tests
claude-coma test

# Run only unit tests
claude-coma test --unit

# Run only integration tests
claude-coma test --integration

# Run tests with debug logging (outputs logs to stdout before cleanup)
claude-coma test --debug
```

The test suite validates:
- Hook installation and removal
- Consensus evaluation logic
- Context capture system
- File scanning functionality
- Error handling scenarios
- Provider interfaces
- End-to-end integration with actual hook triggering

## Acolyte Providers

### Claude Code Acolytes (Default)
Each file gets a Claude Code acolyte that:
- Runs in parallel with other acolytes for speed (3-10 seconds vs 30+ sequential)
- Analyzes proposed changes using full Claude capabilities
- Has access to all Claude Code tools (Read, Grep, etc.)
- No external API keys needed

### OpenAI Acolytes (Alternative)
Each file gets an OpenAI-powered acolyte that:
- Uses direct OpenAI API calls
- Provides different AI perspective on changes
- May be faster for simple validation tasks
- Requires OpenAI API key

Both types:
- Return APPROVE or REJECT
- Any rejection blocks the operation
- Provide detailed reasoning

## Requirements

### Claude Code Provider (Default)
- Node.js 16+
- Claude Code installed
- No external API keys needed

### OpenAI Provider
- Node.js 16+
- Claude Code installed
- OpenAI API key in OPENAI_API_KEY environment variable

## Example Session

```bash
$ claude-coma
COMA: Initializing acolyte protection...
COMA: Hooks installed in ~/.claude/settings.json
COMA: Found 15 files to protect
COMA: Launching Claude with protection active

# Claude Code runs with protection
# Hooks remain installed for future use
```

## Clean Design

- Single entry point: `claude-coma`
- No repository files created
- Permanent hooks with transparent operation
- Zero impact on team when not running
- Self-contained test suite
- ASCII-only output