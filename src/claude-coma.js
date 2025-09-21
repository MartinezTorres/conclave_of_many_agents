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

    if (args.includes('cleanup')) {
      return this.cleanup();
    }

    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

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

    // Default: temporary protection
    return this.runWithProtection();
  }

  showHelp() {
    console.log(`
Claude-COMA (Conclave of Many Agents)

Usage:
  claude-coma [options]         Run Claude with temporary acolyte protection
  claude-coma cleanup          Remove any COMA hooks from user settings

Options:
  --provider <type>            Acolyte provider: "claude-code" (default) or "openai"
  --help, -h                   Show this help

Examples:
  claude-coma                          # Protected Claude with Claude Code acolytes
  claude-coma --provider openai       # Protected Claude with OpenAI acolytes
  claude-coma cleanup                  # Clean up hooks
`);
  }

  async runWithProtection() {
    console.log('COMA: Initializing acolyte protection...');

    try {
      // Install hooks temporarily
      await this.installHooks();

      // Scan repository and create acolytes
      await this.setupAcolytes();

      console.log('COMA: Launching Claude with protection active');

      // Launch Claude
      await this.launchClaude();

    } finally {
      // Always cleanup
      console.log('COMA: Cleaning up temporary hooks...');
      await this.removeHooks();
      await this.cleanupTemp();
    }
  }

  async installHooks() {
    await fs.mkdir(this.userClaudeDir, { recursive: true });

    // Read existing user settings
    let userSettings = {};
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf8');
      userSettings = JSON.parse(content);
    } catch {
      // File doesn't exist, start fresh
    }

    // Backup existing settings
    if (userSettings.hooks || userSettings.mcps) {
      await fs.writeFile(
        path.join(this.userClaudeDir, 'settings.backup.json'),
        JSON.stringify(userSettings, null, 2)
      );
      console.log('COMA: Backed up existing user settings');
    }

    // Add COMA hooks
    const comaHooks = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit|MultiEdit|Write|Bash",
            hooks: [
              {
                type: "command",
                command: path.join(__dirname, 'coma-validator.js')
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
                command: `COMA_HOOK_TYPE=PostToolUse node ${path.join(__dirname, 'context-capturer.js')}`
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
                command: `COMA_HOOK_TYPE=UserPromptSubmit node ${path.join(__dirname, 'context-capturer.js')}`
              }
            ]
          }
        ]
      }
    };


    // Merge with existing settings
    const mergedSettings = {
      ...userSettings,
      ...comaHooks,
      _comaActive: true // Mark that COMA is active
    };

    await fs.writeFile(this.userSettingsPath, JSON.stringify(mergedSettings, null, 2));
    console.log('COMA: Installed protection hooks');
  }

  async removeHooks() {
    try {
      const backupPath = path.join(this.userClaudeDir, 'settings.backup.json');

      // Check if backup exists
      try {
        await fs.access(backupPath);
        // Restore from backup
        const backup = await fs.readFile(backupPath, 'utf8');
        await fs.writeFile(this.userSettingsPath, backup);
        await fs.unlink(backupPath);
        console.log('COMA: Restored original user settings');
      } catch {
        // No backup, check if we need to clean current settings
        try {
          const content = await fs.readFile(this.userSettingsPath, 'utf8');
          const settings = JSON.parse(content);

          if (settings._comaActive) {
            // Remove COMA-specific settings
            delete settings.hooks;
            delete settings.mcps;
            delete settings._comaActive;

            if (Object.keys(settings).length === 0) {
              await fs.unlink(this.userSettingsPath);
              console.log('COMA: Removed user settings file');
            } else {
              await fs.writeFile(this.userSettingsPath, JSON.stringify(settings, null, 2));
              console.log('COMA: Cleaned COMA hooks from user settings');
            }
          }
        } catch {
          // Settings file doesn't exist or is invalid, nothing to clean
        }
      }
    } catch (error) {
      console.log('COMA: Warning - could not fully clean hooks:', error.message);
    }
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

  async launchClaude() {
    return new Promise((resolve, reject) => {
      const claude = spawn('claude', [], {
        cwd: this.repoPath,
        stdio: 'inherit'
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

  async cleanup() {
    console.log('COMA: Removing protection hooks...');
    await this.removeHooks();
    console.log('COMA: Cleanup complete');
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