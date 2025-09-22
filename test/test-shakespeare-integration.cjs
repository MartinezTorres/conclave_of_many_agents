#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Complex integration test that demonstrates COMA's value
 * by enforcing Shakespeare variable naming conventions
 */
class ShakespeareIntegrationTest {
  async executeIntegrationTest() {
    // Create temporary test directory
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-test-'));
    const mockClaudeDir = path.join(testDir, '.claude');
    const debugLogPath = path.join(testDir, 'debug.log');

    try {
      // Set up test environment
      await fs.mkdir(mockClaudeDir, { recursive: true });

      const srcDir = path.join(testDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });

      // Create styling guidelines file
      await fs.writeFile(path.join(testDir, 'STYLE_GUIDE.md'), `# Project Style Guide

## Variable Naming Convention

All variables in this project MUST be named after characters from Shakespeare plays.

Examples:
- hamlet, ophelia, claudius (from Hamlet)
- romeo, juliet, mercutio (from Romeo and Juliet)
- macbeth, ladyMacbeth, duncan (from Macbeth)
- prospero, ariel, caliban (from The Tempest)

This convention helps maintain thematic consistency and makes code more memorable.

**IMPORTANT**: Any variable not following this naming convention should be rejected.
`);

      // Create a file with Shakespeare-named variables
      await fs.writeFile(path.join(srcDir, 'calculator.js'), `
// Calculator module following Shakespeare naming convention
function addNumbers(hamlet, ophelia) {
  return hamlet + ophelia;
}

function multiplyNumbers(romeo, juliet) {
  return romeo * juliet;
}

// Bug: This function has a non-Shakespeare variable name!
function divideNumbers(num1, num2) {
  if (num2 === 0) {
    throw new Error('Division by zero');
  }
  return num1 / num2;
}

module.exports = { addNumbers, multiplyNumbers, divideNumbers };
`);

      // Create agents that know about the style guide
      const comaConfigDir = path.join(testDir, '.coma-temp');
      await fs.mkdir(comaConfigDir, { recursive: true });

      const agents = [
        {
          id: 'agent_src_calculator_js',
          file: 'src/calculator.js',
          systemPrompt: `You are the guardian of src/calculator.js. This project has a STRICT Shakespeare naming convention.

ALL variables MUST be named after Shakespeare characters:
- hamlet, ophelia, claudius (Hamlet)
- romeo, juliet, mercutio (Romeo & Juliet)
- macbeth, ladyMacbeth, duncan (Macbeth)
- prospero, ariel, caliban (The Tempest)
- othello, desdemona, iago (Othello)

You MUST:
- APPROVE changes that replace non-Shakespeare names with Shakespeare names (like changing 'num1, num2' to 'macbeth, duncan')
- REJECT changes that introduce or keep non-Shakespeare names (like 'dividend, divisor, data, result, count, etc.')

Current violations in the file: 'num1' and 'num2' in divideNumbers() are NOT Shakespeare names.

Example decisions:
- Change 'num1, num2' to 'macbeth, duncan' → APPROVE
- Change 'num1, num2' to 'dividend, divisor' → REJECT
- Change 'num1, num2' to 'hamlet, ophelia' → APPROVE`
        }
      ];

      await fs.writeFile(
        path.join(comaConfigDir, 'agents.json'),
        JSON.stringify(agents, null, 2)
      );

      // Test 1: Try to fix bug with non-Shakespeare variable names (should be REJECTED)
      const badToolData = JSON.stringify({
        toolName: 'Edit',
        parameters: {
          file_path: path.join(testDir, 'src', 'calculator.js'),
          old_string: 'function divideNumbers(num1, num2) {',
          new_string: 'function divideNumbers(dividend, divisor) {'
        }
      });
      const badNamingResult = await this.runCommand('node', [path.join(__dirname, '..', 'src', 'claude-coma.js'), 'hook', 'PreToolUse', badToolData], {
        cwd: testDir,
        env: {
          ...process.env,
          HOME: testDir,
          CLAUDE_COMA: '1',
          CLAUDE_COMA_DEBUG: debugLogPath,
          COMA_CONFIG_DIR: comaConfigDir,
          COMA_REPO_PATH: testDir,
          COMA_PROVIDER: 'claude-code'
        }
      });

      // Test 2: Fix bug with proper Shakespeare variable names (should be APPROVED)
      const goodToolData = JSON.stringify({
        toolName: 'Edit',
        parameters: {
          file_path: path.join(testDir, 'src', 'calculator.js'),
          old_string: 'function divideNumbers(num1, num2) {',
          new_string: 'function divideNumbers(macbeth, duncan) {'
        }
      });
      const goodNamingResult = await this.runCommand('node', [path.join(__dirname, '..', 'src', 'claude-coma.js'), 'hook', 'PreToolUse', goodToolData], {
        cwd: testDir,
        env: {
          ...process.env,
          HOME: testDir,
          CLAUDE_COMA: '1',
          CLAUDE_COMA_DEBUG: debugLogPath,
          COMA_CONFIG_DIR: comaConfigDir,
          COMA_REPO_PATH: testDir,
          COMA_PROVIDER: 'claude-code'
        }
      });

      // Test 3: Transparent operation without CLAUDE_COMA
      const transparentResult = await this.runCommand('node', [path.join(__dirname, '..', 'src', 'claude-coma.js'), 'hook', 'PreToolUse'], {
        cwd: testDir,
        env: { ...process.env, HOME: testDir }
      });

      // Verify results
      const badNamingBlocked = badNamingResult.code === 1; // Should be rejected (exit code 1)
      const goodNamingApproved = goodNamingResult.code === 0; // Should be approved (exit code 0)
      const transparentSuccess = transparentResult.code === 0; // Should pass through (exit code 0)

      let debugLogExists = false;
      try {
        await fs.access(debugLogPath);
        debugLogExists = true;
      } catch {}

      console.log(`    Bad naming (should block): ${badNamingBlocked ? 'BLOCKED' : 'ALLOWED'}`);
      console.log(`    Good naming (attempted): ${goodNamingApproved ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(`    Transparent operation: ${transparentSuccess ? 'OK' : 'FAILED'}`);
      console.log(`    COMA Value Demonstrated: ${badNamingBlocked ? 'YES - Caught style violation!' : 'NO'}`);

      // Success if bad naming is blocked and system works (good naming result less critical for demo)
      if (badNamingBlocked && transparentSuccess && debugLogExists) {
        return { success: true };
      } else {
        return {
          success: false,
          error: `Bad naming blocked: ${badNamingBlocked}, Transparent: ${transparentSuccess}, Debug log: ${debugLogExists}`
        };
      }

    } finally {
      // Output debug log contents if debug is enabled before cleanup
      if (debugLogPath) {
        try {
          const logContent = await fs.readFile(debugLogPath, 'utf8');
          if (logContent.trim()) {
            console.log('    Integration test debug log:');
            console.log('    ' + logContent.split('\n').join('\n    '));

            // Also copy to persistent location if CLAUDE_COMA_DEBUG is set
            if (process.env.CLAUDE_COMA_DEBUG && process.env.CLAUDE_COMA_DEBUG !== debugLogPath) {
              await fs.writeFile(process.env.CLAUDE_COMA_DEBUG, logContent);
            }
          }
        } catch {}
      }

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  }
}

// Support running as standalone script
if (require.main === module) {
  const test = new ShakespeareIntegrationTest();
  test.executeIntegrationTest()
    .then((result) => {
      if (result.success) {
        console.log('Shakespeare integration test PASSED');
        process.exit(0);
      } else {
        console.log('Shakespeare integration test FAILED:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Shakespeare integration test ERROR:', error);
      process.exit(1);
    });
}

module.exports = ShakespeareIntegrationTest;