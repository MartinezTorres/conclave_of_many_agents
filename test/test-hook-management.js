/**
 * Test script for COMA hook management (installation and cleanup)
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class TestableCleanComa {
  constructor(testDir) {
    this.testDir = testDir;
    this.userClaudeDir = path.join(testDir, '.claude');
    this.userSettingsPath = path.join(this.userClaudeDir, 'settings.json');
    this.repoPath = testDir;
    this.comaConfigDir = path.join(testDir, '.coma-temp');
    this.agentProvider = 'claude-code';
  }

  // Copy methods from CleanComa for testing
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
              command: "node /fake/path/claude-coma.js hook PreToolUse"
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
              command: "node /fake/path/claude-coma.js hook PostToolUse"
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
              command: "node /fake/path/claude-coma.js hook UserPromptSubmit"
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
  }

  showCleanupInstructions() {
    return `
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
`;
  }

  // For testing purposes, we'll keep a simple remove method
  async removeComaHooks() {
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf8');
      const settings = JSON.parse(content);

      // Remove COMA hooks by filtering out commands containing 'claude-coma hook'
      if (settings.hooks) {
        Object.keys(settings.hooks).forEach(hookType => {
          settings.hooks[hookType] = settings.hooks[hookType].filter(hookGroup => {
            hookGroup.hooks = hookGroup.hooks.filter(hook =>
              !hook.command?.includes('claude-coma hook')
            );
            return hookGroup.hooks.length > 0;
          });
          if (settings.hooks[hookType].length === 0) {
            delete settings.hooks[hookType];
          }
        });

        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
      }

      if (Object.keys(settings).length === 0) {
        await fs.unlink(this.userSettingsPath);
      } else {
        await fs.writeFile(this.userSettingsPath, JSON.stringify(settings, null, 2));
      }
    } catch {
      // Settings file doesn't exist or is invalid, nothing to clean
    }
  }

  async setupAgents() {
    // NOTE: This method is for testing legacy behavior only
    // In the current stateless design, agents are generated dynamically
    // This test method simulates the old stateful approach for testing cleanup
    await fs.mkdir(this.comaConfigDir, { recursive: true });

    const agents = [
      {
        id: 'test_agent_1',
        file: 'test1.js',
        systemPrompt: 'Test prompt for file test1.js'
      }
    ];

    await fs.writeFile(
      path.join(this.comaConfigDir, 'agents.json'),
      JSON.stringify(agents, null, 2)
    );
  }

  async cleanupTemp() {
    try {
      await fs.rm(this.comaConfigDir, { recursive: true, force: true });
    } catch {
      // Temp directory might not exist
    }
  }
}

async function testHookManagement() {
  console.log('Testing COMA hook management (updated for permanent hooks)...\n');

  // Create temporary test directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-test-'));
  console.log(`Using test directory: ${testDir}\n`);

  try {
    const coma = new TestableCleanComa(testDir);

    // Test 1: Install hooks in clean environment
    console.log('Test 1: Install hooks in clean environment');
    await coma.ensureHooksInstalled();

    const settingsContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const settings = JSON.parse(settingsContent);

    const hasPreToolUse = settings.hooks?.PreToolUse?.length > 0;
    const hasPostToolUse = settings.hooks?.PostToolUse?.length > 0;
    const hasComaMarker = settings._comaActive === true;

    if (hasPreToolUse && hasPostToolUse && hasComaMarker) {
      console.log('PASS PASS - Hooks installed correctly');
    } else {
      console.log('FAIL FAIL - Hook installation incomplete');
      console.log('Has PreToolUse:', hasPreToolUse);
      console.log('Has PostToolUse:', hasPostToolUse);
      console.log('Has COMA marker:', hasComaMarker);
    }
    console.log('');

    // Test 2: Install hooks with existing settings
    console.log('Test 2: Install hooks with existing settings (backup scenario)');
    const existingSettings = {
      theme: 'dark',
      hooks: {
        SomeOtherHook: [{ matcher: '.*', hooks: [] }]
      }
    };
    await fs.writeFile(coma.userSettingsPath, JSON.stringify(existingSettings, null, 2));

    await coma.ensureHooksInstalled();

    // Check if backup was created
    const backupPath = path.join(coma.userClaudeDir, 'settings.backup.json');
    const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);

    if (backupExists) {
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backup = JSON.parse(backupContent);

      if (backup.theme === 'dark' && backup.hooks?.SomeOtherHook) {
        console.log('PASS PASS - Existing settings backed up correctly');
      } else {
        console.log('FAIL FAIL - Backup content incorrect');
      }
    } else {
      console.log('FAIL FAIL - Backup file not created');
    }
    console.log('');

    // Test 3: Remove hooks with backup restoration
    console.log('Test 3: Remove hooks with backup restoration');
    await coma.removeComaHooks();

    const restoredContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const restored = JSON.parse(restoredContent);

    const backupRestored = restored.theme === 'dark' && restored.hooks?.SomeOtherHook;
    const comaRemoved = !restored._comaActive && !restored.hooks?.PreToolUse;

    if (backupRestored && comaRemoved) {
      console.log('PASS PASS - Hooks removed and backup restored');
    } else {
      console.log('FAIL FAIL - Hook removal/restoration failed');
      console.log('Backup restored:', backupRestored);
      console.log('COMA removed:', comaRemoved);
    }
    console.log('');

    // Test 4: Remove hooks without backup (clean removal)
    console.log('Test 4: Remove hooks without backup (clean removal)');

    // First remove any existing settings to start truly clean
    await fs.unlink(coma.userSettingsPath).catch(() => {});

    await coma.ensureHooksInstalled();

    // Remove backup file to simulate no-backup scenario
    await fs.unlink(path.join(coma.userClaudeDir, 'settings.backup.json')).catch(() => {});

    // Debug: Check what's in settings before removal
    const beforeContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const beforeSettings = JSON.parse(beforeContent);

    await coma.removeComaHooks();

    const settingsExist = await fs.access(coma.userSettingsPath).then(() => true).catch(() => false);

    if (!settingsExist) {
      console.log('PASS PASS - Settings file removed when no backup exists');
    } else {
      const afterContent = await fs.readFile(coma.userSettingsPath, 'utf8');
      console.log('FAIL FAIL - Settings file should have been removed');
      console.log('Before cleanup:', JSON.stringify(beforeSettings, null, 2));
      console.log('After cleanup:', afterContent);
    }
    console.log('');

    // Test 5: Agent setup and cleanup
    console.log('Test 5: Agent setup and cleanup');
    await coma.setupAgents();

    const agentsPath = path.join(coma.comaConfigDir, 'agents.json');
    const agentsExist = await fs.access(agentsPath).then(() => true).catch(() => false);

    if (agentsExist) {
      const agentsContent = await fs.readFile(agentsPath, 'utf8');
      const agents = JSON.parse(agentsContent);

      if (agents.length === 1 && agents[0].id === 'test_agent_1') {
        console.log('PASS PASS - Agents configured correctly');
      } else {
        console.log('FAIL FAIL - Agent configuration incorrect');
      }
    } else {
      console.log('FAIL FAIL - Agents file not created');
    }

    // Test cleanup
    await coma.cleanupTemp();
    const tempDirExists = await fs.access(coma.comaConfigDir).then(() => true).catch(() => false);

    if (!tempDirExists) {
      console.log('PASS PASS - Temporary directory cleaned up');
    } else {
      console.log('FAIL FAIL - Temporary directory not cleaned up');
    }
    console.log('');

    // Test 6: Error handling - invalid JSON
    console.log('Test 6: Error handling with invalid settings JSON');
    await fs.writeFile(coma.userSettingsPath, 'invalid json content');

    try {
      await coma.ensureHooksInstalled();
      console.log('PASS PASS - Invalid JSON handled gracefully');
    } catch (error) {
      console.log('FAIL FAIL - Should handle invalid JSON gracefully');
      console.log('Error:', error.message);
    }
    console.log('');

  } finally {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    console.log(`Cleaned up test directory: ${testDir}\n`);
  }

  console.log('=== Hook Management Tests Complete ===');
}

async function runTests() {
  try {
    await testHookManagement();
    console.log('SUCCESS All hook management tests completed!');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();