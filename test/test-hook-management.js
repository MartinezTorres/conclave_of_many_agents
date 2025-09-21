#!/usr/bin/env node

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
    this.acolyteProvider = 'claude-code';
  }

  // Copy methods from CleanComa for testing
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
                command: "/fake/path/coma-validator.js"
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
                command: "COMA_HOOK_TYPE=PostToolUse node /fake/path/context-capturer.js"
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
      _comaActive: true
    };

    await fs.writeFile(this.userSettingsPath, JSON.stringify(mergedSettings, null, 2));
  }

  async removeHooks() {
    try {
      const backupPath = path.join(this.userClaudeDir, 'settings.backup.json');

      try {
        await fs.access(backupPath);
        // Restore from backup
        const backup = await fs.readFile(backupPath, 'utf8');
        await fs.writeFile(this.userSettingsPath, backup);
        await fs.unlink(backupPath);
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
            } else {
              await fs.writeFile(this.userSettingsPath, JSON.stringify(settings, null, 2));
            }
          }
        } catch {
          // Settings file doesn't exist or is invalid, nothing to clean
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async setupAcolytes() {
    await fs.mkdir(this.comaConfigDir, { recursive: true });

    const acolytes = [
      {
        id: 'test_acolyte_1',
        file: 'test1.js',
        systemPrompt: 'Test prompt for file test1.js'
      }
    ];

    await fs.writeFile(
      path.join(this.comaConfigDir, 'acolytes.json'),
      JSON.stringify(acolytes, null, 2)
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
  console.log('Testing COMA hook management...\n');

  // Create temporary test directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-test-'));
  console.log(`Using test directory: ${testDir}\n`);

  try {
    const coma = new TestableCleanComa(testDir);

    // Test 1: Install hooks in clean environment
    console.log('Test 1: Install hooks in clean environment');
    await coma.installHooks();

    const settingsContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const settings = JSON.parse(settingsContent);

    const hasPreToolUse = settings.hooks?.PreToolUse?.length > 0;
    const hasPostToolUse = settings.hooks?.PostToolUse?.length > 0;
    const hasComaMarker = settings._comaActive === true;

    if (hasPreToolUse && hasPostToolUse && hasComaMarker) {
      console.log('✅ PASS - Hooks installed correctly');
    } else {
      console.log('❌ FAIL - Hook installation incomplete');
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

    await coma.installHooks();

    // Check if backup was created
    const backupPath = path.join(coma.userClaudeDir, 'settings.backup.json');
    const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);

    if (backupExists) {
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backup = JSON.parse(backupContent);

      if (backup.theme === 'dark' && backup.hooks?.SomeOtherHook) {
        console.log('✅ PASS - Existing settings backed up correctly');
      } else {
        console.log('❌ FAIL - Backup content incorrect');
      }
    } else {
      console.log('❌ FAIL - Backup file not created');
    }
    console.log('');

    // Test 3: Remove hooks with backup restoration
    console.log('Test 3: Remove hooks with backup restoration');
    await coma.removeHooks();

    const restoredContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const restored = JSON.parse(restoredContent);

    const backupRestored = restored.theme === 'dark' && restored.hooks?.SomeOtherHook;
    const comaRemoved = !restored._comaActive && !restored.hooks?.PreToolUse;

    if (backupRestored && comaRemoved) {
      console.log('✅ PASS - Hooks removed and backup restored');
    } else {
      console.log('❌ FAIL - Hook removal/restoration failed');
      console.log('Backup restored:', backupRestored);
      console.log('COMA removed:', comaRemoved);
    }
    console.log('');

    // Test 4: Remove hooks without backup (clean removal)
    console.log('Test 4: Remove hooks without backup (clean removal)');

    // First remove any existing settings to start truly clean
    await fs.unlink(coma.userSettingsPath).catch(() => {});

    await coma.installHooks();

    // Remove backup file to simulate no-backup scenario
    await fs.unlink(path.join(coma.userClaudeDir, 'settings.backup.json')).catch(() => {});

    // Debug: Check what's in settings before removal
    const beforeContent = await fs.readFile(coma.userSettingsPath, 'utf8');
    const beforeSettings = JSON.parse(beforeContent);

    await coma.removeHooks();

    const settingsExist = await fs.access(coma.userSettingsPath).then(() => true).catch(() => false);

    if (!settingsExist) {
      console.log('✅ PASS - Settings file removed when no backup exists');
    } else {
      const afterContent = await fs.readFile(coma.userSettingsPath, 'utf8');
      console.log('❌ FAIL - Settings file should have been removed');
      console.log('Before cleanup:', JSON.stringify(beforeSettings, null, 2));
      console.log('After cleanup:', afterContent);
    }
    console.log('');

    // Test 5: Acolyte setup and cleanup
    console.log('Test 5: Acolyte setup and cleanup');
    await coma.setupAcolytes();

    const acolytesPath = path.join(coma.comaConfigDir, 'acolytes.json');
    const acolytesExist = await fs.access(acolytesPath).then(() => true).catch(() => false);

    if (acolytesExist) {
      const acolytesContent = await fs.readFile(acolytesPath, 'utf8');
      const acolytes = JSON.parse(acolytesContent);

      if (acolytes.length === 1 && acolytes[0].id === 'test_acolyte_1') {
        console.log('✅ PASS - Acolytes configured correctly');
      } else {
        console.log('❌ FAIL - Acolyte configuration incorrect');
      }
    } else {
      console.log('❌ FAIL - Acolytes file not created');
    }

    // Test cleanup
    await coma.cleanupTemp();
    const tempDirExists = await fs.access(coma.comaConfigDir).then(() => true).catch(() => false);

    if (!tempDirExists) {
      console.log('✅ PASS - Temporary directory cleaned up');
    } else {
      console.log('❌ FAIL - Temporary directory not cleaned up');
    }
    console.log('');

    // Test 6: Error handling - invalid JSON
    console.log('Test 6: Error handling with invalid settings JSON');
    await fs.writeFile(coma.userSettingsPath, 'invalid json content');

    try {
      await coma.installHooks();
      console.log('✅ PASS - Invalid JSON handled gracefully');
    } catch (error) {
      console.log('❌ FAIL - Should handle invalid JSON gracefully');
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
    console.log('🎉 All hook management tests completed!');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();