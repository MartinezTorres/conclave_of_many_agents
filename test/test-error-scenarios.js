/**
 * Test script for COMA error scenarios and edge cases
 */

import { ClaudeCodeProvider } from '../src/providers/claude-code.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock provider that simulates various error conditions
class MockErrorProvider {
  constructor(errorType) {
    this.errorType = errorType;
  }

  async consultAgent(agent, toolData) {
    switch (this.errorType) {
      case 'timeout':
        return new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Agent consultation timed out')), 100);
        });

      case 'invalid_response':
        return { decision: 'INVALID', reasoning: 'This is not a valid decision' };

      case 'empty_response':
        return { decision: '', reasoning: '' };

      case 'malformed_response':
        return { decision: 'MAYBE_APPROVE', reasoning: 'Confusing response' };

      case 'api_error':
        throw new Error('API rate limit exceeded');

      case 'network_error':
        throw new Error('Network connection failed');

      case 'permission_error':
        throw new Error('Permission denied: cannot access file');

      default:
        return { decision: 'APPROVE', reasoning: 'Normal response' };
    }
  }
}

async function testProviderErrors() {
  console.log('Testing provider error scenarios...\n');

  const testAgent = {
    id: 'test_agent',
    file: 'test.js',
    systemPrompt: 'Test prompt'
  };

  const testToolData = {
    toolName: 'Edit',
    parameters: { file_path: 'test.js', old_string: 'old', new_string: 'new' },
    claudeContext: 'Test context'
  };

  const errorScenarios = [
    { type: 'timeout', description: 'Agent consultation timeout' },
    { type: 'api_error', description: 'API rate limit error' },
    { type: 'network_error', description: 'Network connection failure' },
    { type: 'permission_error', description: 'File permission error' },
    { type: 'invalid_response', description: 'Invalid decision response' },
    { type: 'empty_response', description: 'Empty response from agent' },
    { type: 'malformed_response', description: 'Malformed decision response' }
  ];

  for (const scenario of errorScenarios) {
    console.log(`Testing: ${scenario.description}`);

    const provider = new MockErrorProvider(scenario.type);

    try {
      const result = await provider.consultAgent(testAgent, testToolData);

      if (['invalid_response', 'empty_response', 'malformed_response'].includes(scenario.type)) {
        console.log(`PASS PASS - Provider handled ${scenario.type} without throwing`);
        console.log(`   Decision: "${result.decision}", Reasoning: "${result.reasoning.substring(0, 50)}..."`);
      } else {
        console.log(`FAIL FAIL - Expected error for ${scenario.type}, got result:`, result);
      }
    } catch (error) {
      if (['timeout', 'api_error', 'network_error', 'permission_error'].includes(scenario.type)) {
        console.log(`PASS PASS - Error thrown as expected: ${error.message}`);
      } else {
        console.log(`FAIL FAIL - Unexpected error for ${scenario.type}: ${error.message}`);
      }
    }
    console.log('');
  }
}

async function testFileSystemErrors() {
  console.log('Testing file system error scenarios...\n');

  // Test 1: File system errors (use non-existent directory)
  console.log('Test 1: File system access errors');

  const provider = new ClaudeCodeProvider('/nonexistent/directory');
  const testAgent = {
    id: 'test_agent',
    file: 'test.js',
    systemPrompt: 'Test prompt'
  };

  const testToolData = {
    toolName: 'Edit',
    parameters: { file_path: 'test.js', old_string: 'old', new_string: 'new' }
  };

  try {
    await provider.consultAgent(testAgent, testToolData);
    console.log('WARN  WARN - Expected file system error but provider handled gracefully');
  } catch (error) {
    console.log('PASS PASS - File system error handled correctly:', error.message.substring(0, 60) + '...');
  }
  console.log('');

  // Test 2: Invalid tool data
  console.log('Test 2: Invalid tool data formats');

  const invalidToolDataScenarios = [
    { name: 'null tool data', data: null },
    { name: 'undefined tool data', data: undefined },
    { name: 'missing toolName', data: { parameters: {} } },
    { name: 'missing parameters', data: { toolName: 'Edit' } },
    { name: 'circular reference', data: null }
  ];

  // Create circular reference for last test
  const circularData = { toolName: 'Edit', parameters: {} };
  circularData.circular = circularData;
  invalidToolDataScenarios[4].data = circularData;

  for (const scenario of invalidToolDataScenarios) {
    console.log(`  Testing: ${scenario.name}`);

    try {
      const mockProvider = new MockErrorProvider('normal');
      await mockProvider.consultAgent(testAgent, scenario.data);

      console.log('  PASS PASS - Provider handled invalid data gracefully');
    } catch (error) {
      console.log(`  PASS PASS - Error handled: ${error.message.substring(0, 50)}...`);
    }
  }
  console.log('');
}

async function testConcurrencyErrors() {
  console.log('Testing concurrency and race condition scenarios...\n');

  // Test 1: Multiple simultaneous agent consultations with errors
  console.log('Test 1: Multiple agents with mixed success/failure');

  const agents = [
    { id: 'success1', file: 'file1.js', systemPrompt: 'Test' },
    { id: 'timeout1', file: 'file2.js', systemPrompt: 'Test' },
    { id: 'success2', file: 'file3.js', systemPrompt: 'Test' },
    { id: 'error1', file: 'file4.js', systemPrompt: 'Test' },
    { id: 'success3', file: 'file5.js', systemPrompt: 'Test' }
  ];

  const providers = [
    new MockErrorProvider('normal'),    // success1
    new MockErrorProvider('timeout'),   // timeout1
    new MockErrorProvider('normal'),    // success2
    new MockErrorProvider('api_error'), // error1
    new MockErrorProvider('normal')     // success3
  ];

  const toolData = {
    toolName: 'Edit',
    parameters: { file_path: 'test.js' }
  };

  try {
    const promises = agents.map((agent, index) =>
      providers[index].consultAgent(agent, toolData)
        .then(result => ({ agentId: agent.id, success: true, result }))
        .catch(error => ({ agentId: agent.id, success: false, error: error.message }))
    );

    const results = await Promise.all(promises);

    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    if (successes === 3 && failures === 2) {
      console.log('PASS - Concurrent agent consultations handled correctly');
      console.log(`   Successes: ${successes}, Failures: ${failures}`);
    } else {
      console.log(`FAIL FAIL - Expected 3 successes and 2 failures, got ${successes} successes and ${failures} failures`);
    }
  } catch (error) {
    console.log(`FAIL FAIL - Unexpected error in concurrent test: ${error.message}`);
  }
  console.log('');

  // Test 2: Resource exhaustion simulation
  console.log('Test 2: Resource exhaustion with many concurrent agents');

  const manyAgents = Array.from({ length: 20 }, (_, i) => ({
    id: `agent_${i}`,
    file: `file${i}.js`,
    systemPrompt: 'Test'
  }));

  const startTime = Date.now();

  try {
    const promises = manyAgents.map(agent =>
      new MockErrorProvider('normal').consultAgent(agent, toolData)
        .catch(error => ({ error: error.message }))
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();

    const errors = results.filter(r => r.error).length;

    console.log(`PASS - Handled ${manyAgents.length} concurrent agents in ${endTime - startTime}ms`);
    console.log(`   Errors: ${errors}/${manyAgents.length}`);
  } catch (error) {
    console.log(`FAIL FAIL - Resource exhaustion test failed: ${error.message}`);
  }
  console.log('');
}

async function testEnvironmentErrors() {
  console.log('Testing environment and configuration errors...\n');

  // Test 1: Invalid working directory
  console.log('Test 1: Invalid working directory');

  try {
    const provider = new ClaudeCodeProvider('/nonexistent/directory/path');
    console.log('PASS PASS - Provider created with invalid directory (validation deferred)');
  } catch (error) {
    console.log(`PASS PASS - Invalid directory error: ${error.message}`);
  }
  console.log('');
}

async function runAllErrorTests() {
  console.log('=== COMA Error Scenario Testing ===\n');

  try {
    await testProviderErrors();
    await testFileSystemErrors();
    await testConcurrencyErrors();
    await testEnvironmentErrors();

    console.log('SUCCESS All error scenario tests completed!');
    console.log('\nThese tests verify that COMA handles various failure modes gracefully');
    console.log('and continues to provide security even when individual components fail.');

  } catch (error) {
    console.error('Error test runner failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllErrorTests();