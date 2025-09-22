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
    this.comaConfigDir = path.join(this.repoPath, '.coma-temp');
    this.acolyteProvider = 'claude-code'; // Default provider
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
      this.acolyteProvider = args[providerIndex + 1];
    }

    // Validate provider
    if (!['claude-code', 'openai'].includes(this.acolyteProvider)) {
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
  claude-coma [options]         Run Claude with acolyte protection
  claude-coma cleanup          Show how to remove COMA hooks
  claude-coma hook <type>      Hook entry point (internal use)

Options:
  --provider <type>            Acolyte provider: "claude-code" (default) or "openai"
  --debug                      Enable debug logging to .claude-coma.log
  --debug=<path>               Enable debug logging to custom path
  --help, -h                   Show this help

Examples:
  claude-coma                          # Protected Claude with Claude Code acolytes
  claude-coma --provider openai       # Protected Claude with OpenAI acolytes
  claude-coma --debug                  # With debug logging
  claude-coma --debug=/tmp/debug.log   # With custom debug log path
  claude-coma cleanup                  # Show removal instructions
`);
  }

  async runWithProtection() {
    console.log('COMA: Initializing acolyte protection...');
    debugLog('Starting COMA protection session');

    // Scan repository and create acolytes
    await this.setupAcolytes();

    console.log('COMA: Launching Claude with protection active');
    debugLog('Launching Claude with COMA environment');

    try {
      // Set environment variables for COMA
      const claudeEnv = { ...process.env, CLAUDE_COMA: '1' };
      if (this.debugPath) {
        claudeEnv.CLAUDE_COMA_DEBUG = this.debugPath;
        debugLog(`Debug logging enabled: ${this.debugPath}`);
      }

      // Launch Claude
      await this.launchClaude(claudeEnv);
    } finally {
      // Cleanup temporary files
      debugLog('Cleaning up temporary files');
      await this.cleanupTemp();
    }
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

  async setupAcolytes() {
    await fs.mkdir(this.comaConfigDir, { recursive: true });

    // Simple repository scan
    const files = await this.scanRepository();
    console.log(`COMA: Found ${files.length} files to protect`);

    // Load base prompt template
    const promptPath = path.join(__dirname, 'prompts', 'base.md');
    const basePrompt = await fs.readFile(promptPath, 'utf8');

    // Create acolyte configurations
    const acolytes = files.map(file => ({
      id: `acolyte_${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
      file: file,
      systemPrompt: basePrompt.replace('{{FILE_PATH}}', file).replace('{{FILE_TYPE_GUIDELINES}}', '')
    }));

    await fs.writeFile(
      path.join(this.comaConfigDir, 'acolytes.json'),
      JSON.stringify(acolytes, null, 2)
    );

    // Set environment for validator
    process.env.COMA_CONFIG_DIR = this.comaConfigDir;
    process.env.COMA_REPO_PATH = this.repoPath;
    process.env.COMA_PROVIDER = this.acolyteProvider;
  }

  async scanRepository() {
    const files = [];
    const ignorePatterns = [
      '.git/', '.claude/', '.coma-temp/', 'node_modules/', '*.log', '*.tmp',
      '.DS_Store', '*.pyc', '__pycache__/', '.pytest_cache/', 'coverage/',
      'dist/', 'build/'
    ];

    async function scanDir(dir, relativePath = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativeFilePath = path.join(relativePath, entry.name);

          // Check ignore patterns
          const ignored = ignorePatterns.some(pattern => {
            if (pattern.endsWith('/')) {
              return relativeFilePath.startsWith(pattern) ||
                     relativeFilePath.includes('/' + pattern);
            }
            if (pattern.includes('*')) {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(relativeFilePath);
            }
            return relativeFilePath === pattern ||
                   relativeFilePath.includes('/' + pattern);
          });

          if (ignored) continue;

          if (entry.isDirectory()) {
            await scanDir(fullPath, relativeFilePath);
          } else {
            files.push(relativeFilePath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await scanDir(this.repoPath);
    return files;
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

  async cleanupTemp() {
    try {
      await fs.rm(this.comaConfigDir, { recursive: true, force: true });
    } catch {
      // Temp directory might not exist
    }
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
    switch (hookType) {
      case 'PreToolUse':
        return this.handlePreToolUse();
      case 'PostToolUse':
        return this.handlePostToolUse();
      case 'UserPromptSubmit':
        return this.handleUserPromptSubmit();
      default:
        console.error(`COMA: Unknown hook type: ${hookType}`);
        debugLog(`ERROR: Unknown hook type: ${hookType}`);
        process.exit(1);
    }
  }

  async handlePreToolUse() {
    debugLog('PreToolUse: Delegating to coma-validator');
    // Delegate to coma-validator
    const { spawn } = await import('child_process');
    const validator = spawn('node', [path.join(__dirname, 'coma-validator.js')], {
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

  async handlePostToolUse() {
    debugLog('PostToolUse: Delegating to context-capturer');
    // Delegate to context-capturer
    const { spawn } = await import('child_process');
    const capturer = spawn('node', [path.join(__dirname, 'context-capturer.js')], {
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

  async handleUserPromptSubmit() {
    debugLog('UserPromptSubmit: Delegating to context-capturer');
    // Delegate to context-capturer
    const { spawn } = await import('child_process');
    const capturer = spawn('node', [path.join(__dirname, 'context-capturer.js')], {
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