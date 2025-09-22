/**
 * COMA Test Runner
 * Centralized test execution for all COMA components
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ComaTestRunner {
  constructor() {
    this.repoPath = path.join(__dirname, '..');
  }

  async run(args) {
    console.log('COMA Test Suite\n');

    const runUnit = args.includes('--unit') || (!args.includes('--integration') && !args.includes('--unit') && !args.includes('--providers'));
    const runIntegration = args.includes('--integration') || (!args.includes('--integration') && !args.includes('--unit') && !args.includes('--providers'));
    const runProviders = args.includes('--providers');
    const debugTests = args.includes('--debug');

    let passed = 0;
    let failed = 0;

    try {
      // Set up debug logging for tests if requested
      if (debugTests) {
        process.env.CLAUDE_COMA_DEBUG = path.join(this.repoPath, 'test-debug.log');
        console.log('Debug logging enabled: test-debug.log');
      }

      if (runUnit) {
        console.log('Running unit tests...');
        const unitResults = await this.runUnitTests();
        passed += unitResults.passed;
        failed += unitResults.failed;
      }

      if (runIntegration) {
        console.log('\nRunning integration tests...');
        const integrationResults = await this.runIntegrationTest();
        passed += integrationResults.passed;
        failed += integrationResults.failed;
      }

      if (runProviders) {
        console.log('\nRunning provider tests...');
        const providerResults = await this.runProviderTests();
        passed += providerResults.passed;
        failed += providerResults.failed;
      }

      // Output debug logs before cleanup if debug was enabled
      if (debugTests) {
        await this.outputDebugLogs();
      }

      console.log(`\nTest Results: ${passed} passed, ${failed} failed`);

      if (failed > 0) {
        console.log('FAIL - Some tests failed');
        process.exit(1);
      } else {
        console.log('PASS - All tests passed');
      }

    } catch (error) {
      console.error('Test suite error:', error.message);
      process.exit(1);
    }
  }

  async runUnitTests() {
    const testFiles = [
      'test-hook-management.js',
      'test-consensus-logic.js',
      'test-context-capture.js',
      'test-file-scanning.js',
      'test-error-scenarios.js',
      'test-providers.js'
    ];

    let passed = 0;
    let failed = 0;

    for (const testFile of testFiles) {
      const testPath = path.join(__dirname, testFile);
      try {
        console.log(`  Running ${testFile}...`);

        // Run test file as child process to isolate it
        const result = await this.runTestFile(testPath);

        if (result.code === 0) {
          console.log(`  PASS - ${testFile}`);
          passed++;
        } else {
          console.log(`  FAIL - ${testFile}`);
          if (result.stderr) {
            console.log(`    Error: ${result.stderr}`);
          }
          failed++;
        }
      } catch (error) {
        console.log(`  FAIL - ${testFile}: ${error.message}`);
        failed++;
      }
    }

    return { passed, failed };
  }

  async runIntegrationTest() {
    console.log('  Running integration test...');

    try {
      // Run simple hook test first
      const basicResult = await this.executeIntegrationTest();

      // Run complex Shakespeare integration test
      const shakespeareTestPath = path.join(__dirname, 'test-shakespeare-integration.cjs');
      console.log('  Running Shakespeare naming convention test...');
      const shakespeareResult = await this.runCommand('node', [shakespeareTestPath], {
        env: { ...process.env, CLAUDE_COMA_DEBUG: process.env.CLAUDE_COMA_DEBUG }
      });

      const shakespeareSuccess = shakespeareResult.code === 0;

      const allPassed = basicResult.success && shakespeareSuccess;

      if (allPassed) {
        console.log('  PASS - Integration test');
        return { passed: 1, failed: 0 };
      } else {
        console.log('  FAIL - Integration test');
        if (!basicResult.success) {
          console.log(`    Basic test error: ${basicResult.error}`);
        }
        if (!shakespeareSuccess) {
          console.log(`    Shakespeare test failed (exit code: ${shakespeareResult.code})`);
          if (shakespeareResult.stderr) {
            console.log(`    stderr: ${shakespeareResult.stderr}`);
          }
        }
        return { passed: 0, failed: 1 };
      }
    } catch (error) {
      console.log(`  FAIL - Integration test: ${error.message}`);
      return { passed: 0, failed: 1 };
    }
  }

  async runProviderTests() {
    console.log('  Running provider interface test...');

    try {
      const testPath = path.join(__dirname, 'test-providers.js');
      const result = await this.runTestFile(testPath);

      if (result.code === 0) {
        console.log('  PASS - Provider tests');
        return { passed: 1, failed: 0 };
      } else {
        console.log('  FAIL - Provider tests');
        if (result.stderr) {
          console.log(`    Error: ${result.stderr}`);
        }
        return { passed: 0, failed: 1 };
      }
    } catch (error) {
      console.log(`  FAIL - Provider tests: ${error.message}`);
      return { passed: 0, failed: 1 };
    }
  }

  async executeIntegrationTest() {
    // Simple integration test - just verify hooks work
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-test-'));

    try {
      const result = await this.runCommand('node', [path.join(this.repoPath, 'src', 'claude-coma.js'), 'hook', 'PreToolUse'], {
        cwd: testDir,
        env: { ...process.env, HOME: testDir }
      });

      const success = result.code === 0;
      console.log(`    Hook routing: ${success ? 'OK' : 'FAILED'}`);

      return { success };
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  }

  async runTestFile(testPath) {
    return new Promise((resolve) => {
      const proc = spawn('node', [testPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
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
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
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

  async outputDebugLogs() {
    const debugLogPath = process.env.CLAUDE_COMA_DEBUG;
    if (!debugLogPath) return;

    try {
      const logContent = await fs.readFile(debugLogPath, 'utf8');
      if (logContent.trim()) {
        console.log('\n=== DEBUG LOG OUTPUT ===');
        console.log(logContent.trim());
        console.log('=== END DEBUG LOG ===\n');
      }
    } catch (error) {
      console.log('Debug log not available');
    }
  }

  showHelp() {
    console.log(`
COMA Test Runner

Usage:
  node test/test-runner.js [options]

Test Options:
  (no options)          Run all tests
  --unit               Run unit tests only
  --integration        Run integration test only
  --providers          Run provider interface tests only
  --debug              Run tests with debug logging

Examples:
  node test/test-runner.js                  # Run all tests
  node test/test-runner.js --unit           # Unit tests only
  node test/test-runner.js --integration    # Integration test only
  node test/test-runner.js --providers      # Provider tests only
  node test/test-runner.js --debug          # With debug logging
`);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    new ComaTestRunner().showHelp();
    process.exit(0);
  }

  const runner = new ComaTestRunner();
  runner.run(args);
}

export { ComaTestRunner };