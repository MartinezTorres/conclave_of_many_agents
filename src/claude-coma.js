#!/usr/bin/env node

/**
 * Claude-COMA - Conclave of Many Agents
 * Main launcher: claude-coma (temp protection) and claude-coma cleanup (remove hooks)
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Debug logging utility
function debugLog(message) {
  const logPath = process.env.CLAUDE_COMA_DEBUG;
  if (logPath) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const logEntry = `${timestamp} [${pid}] ${message}\n`;
    fs.appendFile(logPath, logEntry).catch(() => {});
  }
}

class CleanComa {
  constructor() {
    this.userClaudeDir = path.join(os.homedir(), '.claude');
    this.userSettingsPath = path.join(this.userClaudeDir, 'settings.json');
    this.repoPath = process.cwd();
    this.agentProvider = 'claude-code'; // Default provider
  }

  async run() {
    const args = process.argv.slice(2);

    // Handle subcommands
    if (args[0] === 'hook') {
      return this.handleHookCommand(args.slice(1));
    }

    if (args[0] === 'cleanup') {
      return this.showCleanupInstructions();
    }

    if (args[0] === 'test') {
      return this.delegateToTestRunner(args.slice(1));
    }

    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    // Parse debug option
    let debugPath = null;
    if (args.includes('--debug')) {
      debugPath = '.claude-coma.log';
    } else {
      const debugFlag = args.find(arg => arg.startsWith('--debug='));
      if (debugFlag) {
        debugPath = debugFlag.split('=')[1];
      }
    }
    this.debugPath = debugPath;

    // Parse provider option
    const providerIndex = args.indexOf('--provider');
    if (providerIndex !== -1 && args[providerIndex + 1]) {
      this.agentProvider = args[providerIndex + 1];
    }

    // Validate provider
    if (!['claude-code', 'openai'].includes(this.agentProvider)) {
      console.error('COMA: Invalid provider. Use "claude-code" or "openai"');
      process.exit(1);
    }

    // Auto-install hooks if needed
    await this.ensureHooksInstalled();

    // Default: run with protection
    return this.runWithProtection();
  }

  showHelp() {
    console.log(`
Claude-COMA (Conclave of Many Agents)

Usage:
  claude-coma [options]         Run Claude with agent protection
  claude-coma cleanup          Show how to remove COMA hooks
  claude-coma test [options]   Run test suite
  claude-coma hook <type>      Hook entry point (internal use)

Options:
  --provider <type>            Agent provider: "claude-code" (default) or "openai"
  --debug                      Enable debug logging to .claude-coma.log
  --debug=<path>               Enable debug logging to custom path
  --help, -h                   Show this help

Test Options:
  claude-coma test             Run all tests
  claude-coma test --unit      Run unit tests only
  claude-coma test --integration  Run integration test only
  claude-coma test --providers Run provider interface tests only
  claude-coma test --debug     Run tests with debug logging

Examples:
  claude-coma                          # Protected Claude with Claude Code agents
  claude-coma --provider openai       # Protected Claude with OpenAI agents
  claude-coma --debug                  # With debug logging
  claude-coma --debug=/tmp/debug.log   # With custom debug log path
  claude-coma test                     # Run all tests
  claude-coma test --integration       # Test actual hook integration
  claude-coma cleanup                  # Show removal instructions
`);
  }

  async runWithProtection() {
    console.log('COMA: Initializing agent protection...');
    debugLog('Starting COMA protection session');

    // Set environment for validator
    await this.setupEnvironment();

    console.log('COMA: Launching Claude with protection active');
    debugLog('Launching Claude with COMA environment');

    // Set environment variables for COMA
    const claudeEnv = { ...process.env, CLAUDE_COMA: '1' };
    if (this.debugPath) {
      claudeEnv.CLAUDE_COMA_DEBUG = this.debugPath;
      debugLog(`Debug logging enabled: ${this.debugPath}`);
    }

    // Launch Claude
    await this.launchClaude(claudeEnv);
  }

  async ensureHooksInstalled() {
    await fs.mkdir(this.userClaudeDir, { recursive: true });

    // Read existing user settings
    let userSettings = {};
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf8');
      userSettings = JSON.parse(content);
    } catch {
      // File doesn't exist, start fresh
    }

    // Check if COMA hooks are already installed
    const hasComaHooks = userSettings.hooks?.PreToolUse?.some(hook =>
      hook.hooks?.some(h => h.command?.includes('claude-coma hook'))
    );

    if (hasComaHooks) {
      return; // Already installed
    }

    // Add COMA hooks
    const comaHooks = {
      PreToolUse: [
        {
          matcher: "Edit|MultiEdit|Write|Bash",
          hooks: [
            {
              type: "command",
              command: `${process.argv[0]} ${path.join(__dirname, 'claude-coma.js')} hook PreToolUse`
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command: `${process.argv[0]} ${path.join(__dirname, 'claude-coma.js')} hook PostToolUse`
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command: `${process.argv[0]} ${path.join(__dirname, 'claude-coma.js')} hook UserPromptSubmit`
            }
          ]
        }
      ]
    };

    // Merge with existing settings
    const mergedSettings = {
      ...userSettings,
      hooks: {
        ...userSettings.hooks,
        ...comaHooks
      }
    };

    await fs.writeFile(this.userSettingsPath, JSON.stringify(mergedSettings, null, 2));
    console.log('COMA: Hooks installed in ~/.claude/settings.json');
  }

  showCleanupInstructions() {
    console.log(`
COMA Hook Removal Instructions:

Hooks are installed in: ${this.userSettingsPath}

To remove COMA hooks:
1. Edit ~/.claude/settings.json
2. Remove any hook entries containing 'claude-coma hook'
3. Or delete the entire file if you have no other Claude Code settings

Example COMA hook entries to remove:
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|MultiEdit|Write|Bash",
      "hooks": [{
        "type": "command",
        "command": "...claude-coma hook PreToolUse"
      }]
    }]
  }
}
`);
  }

  async setupEnvironment() {
    // Set environment variables for validator (stateless design)
    process.env.COMA_REPO_PATH = this.repoPath;
    process.env.COMA_PROVIDER = this.agentProvider;
  }

  async launchClaude(env = process.env) {
    return new Promise((resolve, reject) => {
      const claude = spawn('claude', [], {
        cwd: this.repoPath,
        stdio: 'inherit',
        env: env
      });

      claude.on('close', (code) => {
        resolve(code);
      });

      claude.on('error', (error) => {
        reject(error);
      });
    });
  }

  handleHookCommand(args) {
    const hookType = args[0];

    // If CLAUDE_COMA is not set, act transparently (do nothing)
    if (!process.env.CLAUDE_COMA) {
      debugLog(`Hook ${hookType} called but CLAUDE_COMA not set - acting transparently`);
      process.exit(0);
    }

    debugLog(`Hook ${hookType} triggered`);

    // Handle different hook types
    const hookArgs = args.slice(1); // Everything after the hook type
    switch (hookType) {
      case 'PreToolUse':
        return this.handlePreToolUse(hookArgs);
      case 'PostToolUse':
        return this.handlePostToolUse(hookArgs);
      case 'UserPromptSubmit':
        return this.handleUserPromptSubmit(hookArgs);
      default:
        console.error(`COMA: Unknown hook type: ${hookType}`);
        debugLog(`ERROR: Unknown hook type: ${hookType}`);
        process.exit(1);
    }
  }

  async handlePreToolUse(hookArgs = []) {
    debugLog('PreToolUse: Delegating to coma-validator');
    // Delegate to coma-validator with tool data
    const { spawn } = await import('child_process');
    const validator = spawn('node', [path.join(__dirname, 'coma-validator.js'), ...hookArgs], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    return new Promise((resolve) => {
      validator.on('close', (code) => {
        debugLog(`PreToolUse: coma-validator exited with code ${code}`);
        process.exit(code);
      });
    });
  }

  async handlePostToolUse(hookArgs = []) {
    debugLog('PostToolUse: Delegating to context-capturer');
    // Delegate to context-capturer
    const { spawn } = await import('child_process');
    const capturer = spawn('node', [path.join(__dirname, 'context-capturer.js'), ...hookArgs], {
      stdio: 'inherit',
      env: { ...process.env, COMA_HOOK_TYPE: 'PostToolUse' }
    });

    return new Promise((resolve) => {
      capturer.on('close', (code) => {
        debugLog(`PostToolUse: context-capturer exited with code ${code}`);
        process.exit(code);
      });
    });
  }

  async handleUserPromptSubmit(hookArgs = []) {
    debugLog('UserPromptSubmit: Delegating to context-capturer');
    // Delegate to context-capturer
    const { spawn } = await import('child_process');
    const capturer = spawn('node', [path.join(__dirname, 'context-capturer.js'), ...hookArgs], {
      stdio: 'inherit',
      env: { ...process.env, COMA_HOOK_TYPE: 'UserPromptSubmit' }
    });

    return new Promise((resolve) => {
      capturer.on('close', (code) => {
        debugLog(`UserPromptSubmit: context-capturer exited with code ${code}`);
        process.exit(code);
      });
    });
  }

  async delegateToTestRunner(args) {
    // Delegate all test functionality to the dedicated test runner
    const testRunnerPath = path.join(__dirname, '..', 'test', 'test-runner.js');
    const { spawn } = await import('child_process');

    const proc = spawn('node', [testRunnerPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    return new Promise((resolve) => {
      proc.on('close', (code) => {
        process.exit(code);
      });
    });
  }

}

// Run
async function main() {
  try {
    const coma = new CleanComa();
    await coma.run();
  } catch (error) {
    console.error('COMA Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
