/**
 * Test script for COMA provider interface and parallel execution
 */

import { ClaudeCodeProvider } from '../src/providers/claude-code.js';
import { OpenAIProvider } from '../src/providers/openai.js';

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
    { name: 'Claude Code', class: ClaudeCodeProvider },
    { name: 'OpenAI', class: OpenAIProvider, requiresApiKey: true }
  ];

  for (const { name, class: ProviderClass, requiresApiKey } of providers) {
    console.log(`\n=== Testing ${name} Provider ===`);

    let provider;

    // Test 1: Constructor creates instance
    runner.test(`${name} provider constructor`, () => {
      provider = new ProviderClass(process.cwd());
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
    await runner.asyncTest(`${name} provider parallel execution`, async () => {
      // Skip actual execution test for OpenAI without API key
      if (requiresApiKey && !process.env.OPENAI_API_KEY) {
        console.log(`    Skipping execution test for ${name} - no API key`);
        return;
      }

      const promises = agents.map(agent =>
        provider.consultAgent(agent, context)
          .then(result => {
            if (typeof result !== 'string') {
              throw new Error(`Must return string, got ${typeof result}`);
            }
            return { success: true, result };
          })
      );

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;

      if (successful !== agents.length) {
        throw new Error(`Expected ${agents.length} successful consultations, got ${successful}`);
      }
    });
  }

  const success = runner.summary();
  process.exit(success ? 0 : 1);
}

testProviders().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});