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
# Run Claude with temporary protection (default: Claude Code acolytes)
claude-coma

# Run Claude with OpenAI acolytes
claude-coma --provider openai

# Remove any leftover hooks
claude-coma cleanup
```

## How It Works

1. **claude-coma**:
   - Installs hooks in ~/.claude/settings.json
   - Scans repository and creates acolyte configs
   - Launches Claude Code with protection
   - Removes hooks when Claude exits

2. **claude-coma cleanup**:
   - Removes any COMA hooks from user settings
   - Restores original settings if backup exists

## What Gets Protected

- Edit operations
- MultiEdit operations
- Write operations
- Bash commands

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
- Return APPROVE, REJECT, or NEEDS_CONTEXT
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
COMA: Backed up existing user settings
COMA: Installed protection hooks
COMA: Found 15 files to protect
COMA: Launching Claude with protection active

# Claude Code runs with protection

COMA: Cleaning up temporary hooks...
COMA: Restored original user settings
```

## Clean Design

- Only 2 commands total
- No repository files created
- Temporary hooks only
- Zero impact on team
- ASCII-only output