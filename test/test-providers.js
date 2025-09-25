/**
 * Test script for COMA provider interface and parallel execution
 */

import { ClaudeCodeProvider } from '../src/providers/claude-code.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class ProviderTestRunner {
  constructor() {
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.failures = [];
  }

  test(description, testFn) {
    this.totalTests++;
    try {
      testFn();
      console.log(`PASS ${description}`);
      this.passedTests++;
    } catch (error) {
      console.log(`FAIL ${description}: ${error.message}`);
      this.failedTests++;
      this.failures.push({ description, error: error.message });
    }
  }

  async asyncTest(description, testFn) {
    this.totalTests++;
    try {
      await testFn();
      console.log(`PASS ${description}`);
      this.passedTests++;
    } catch (error) {
      console.log(`FAIL ${description}: ${error.message}`);
      this.failedTests++;
      this.failures.push({ description, error: error.message });
    }
  }

  summary() {
    console.log(`\nTest Results: ${this.passedTests} passed, ${this.failedTests} failed`);

    if (this.failedTests > 0) {
      console.log('\nFailures:');
      this.failures.forEach(({ description, error }) => {
        console.log(`  FAIL ${description}: ${error}`);
      });
      return false;
    }
    return true;
  }
}

async function testProviders() {
  console.log('Testing COMA provider interface and parallel execution...');

  const runner = new ProviderTestRunner();

  // Create isolated test environment like integration test
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-provider-test-'));

  try {

  // Test data following PROVIDERS.md spec
  const agents = [
    {
      id: 'test-agent-1',
      systemPrompt: 'You are a code reviewer. Respond with APPROVE or REJECT and give reasoning.'
    },
    {
      id: 'test-agent-2',
      systemPrompt: 'You are a security checker. Respond with APPROVE or REJECT and give reasoning.'
    }
  ];

  const context = {
    toolName: 'Edit',
    parameters: { file_path: 'test.js', old_string: 'var x = 1', new_string: 'const x = 1' },
    description: 'Change var to const for better practices'
  };

  // Available providers
  const providers = [
    { name: 'Claude Code', class: ClaudeCodeProvider }
  ];

  for (const { name, class: ProviderClass, requiresApiKey } of providers) {
    console.log(`\n=== Testing ${name} Provider ===`);

    let provider;

    // Test 1: Constructor creates instance
    runner.test(`${name} provider constructor`, () => {
      provider = new ProviderClass(testDir); // Use isolated test directory
      if (!provider) throw new Error('Constructor failed to create instance');
    });

    if (!provider) continue;

    // Test 2: Constructor sets repoPath
    runner.test(`${name} provider sets repoPath`, () => {
      if (!provider.repoPath) throw new Error('Constructor must set repoPath property');
    });

    // Test 3: Has consultAgent method (PROVIDERS.md spec)
    runner.test(`${name} provider has consultAgent method`, () => {
      if (typeof provider.consultAgent !== 'function') {
        throw new Error('Provider must implement consultAgent method as per PROVIDERS.md spec');
      }
    });

    // Test 4: Should not have deprecated consultAcolyte method
    runner.test(`${name} provider does not have deprecated consultAcolyte`, () => {
      if (typeof provider.consultAcolyte === 'function') {
        throw new Error('Provider should not have deprecated consultAcolyte method');
      }
    });

    // Test 5: Parallel execution with return type validation
    // This test should now properly detect authentication failures in isolated environment
    await runner.asyncTest(`${name} provider parallel execution`, async () => {

      // Save original environment
      const originalEnv = process.env;

      try {
        // Set isolated environment like integration test (should cause auth failure)
        process.env = {
          ...originalEnv,
          HOME: testDir, // This breaks Claude Code auth - provider test should detect this
        };

        const promises = agents.map(agent =>
          provider.consultAgent(agent, context)
            .then(result => {
              if (typeof result !== 'string') {
                throw new Error(`Must return string, got ${typeof result}`);
              }
              return { success: true, result };
            })
            .catch(error => {
              // Convert errors to failed results instead of throwing
              return { success: false, error: error.message };
            })
        );

        const results = await Promise.all(promises);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success);

        if (failed.length > 0) {
          console.log(`    Provider failures detected: ${failed.map(f => f.error).join(', ')}`);
          throw new Error(`Provider consultation failed: ${failed[0].error}`);
        }

        if (successful !== agents.length) {
          throw new Error(`Expected ${agents.length} successful consultations, got ${successful}`);
        }
      } finally {
        // Restore original environment
        process.env = originalEnv;
      }
    });
  }

  } finally {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  }

  const success = runner.summary();
  process.exit(success ? 0 : 1);
}

testProviders().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});