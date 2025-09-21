#!/usr/bin/env node

/**
 * Test script for COMA context capture system
 */

import { ContextManager } from '../src/context-manager.js';

async function testContextCapture() {
  console.log('Testing COMA context capture system...\n');

  const contextManager = new ContextManager();

  // Test 1: Basic message storage and retrieval
  console.log('Test 1: Basic message storage and retrieval');
  contextManager.clearContext();

  contextManager.storeMessage('First Claude response');
  contextManager.storeMessage('Second Claude response');

  const messages = contextManager.getStoredMessages();
  if (messages.length === 2 && messages[0] === 'Second Claude response' && messages[1] === 'First Claude response') {
    console.log('✅ PASS - Messages stored and retrieved in correct order (newest first)');
  } else {
    console.log('❌ FAIL - Message storage/retrieval failed');
    console.log('Expected: ["Second Claude response", "First Claude response"]');
    console.log('Got:', messages);
  }
  console.log('');

  // Test 2: Message limit enforcement
  console.log('Test 2: Message limit enforcement (max 5 messages)');
  contextManager.clearContext();

  for (let i = 1; i <= 7; i++) {
    contextManager.storeMessage(`Message ${i}`);
  }

  const limitedMessages = contextManager.getStoredMessages();
  if (limitedMessages.length === 5 && limitedMessages[0] === 'Message 7' && limitedMessages[4] === 'Message 3') {
    console.log('✅ PASS - Message limit enforced correctly');
  } else {
    console.log('❌ FAIL - Message limit not enforced');
    console.log('Expected 5 messages, got:', limitedMessages.length);
    console.log('Messages:', limitedMessages);
  }
  console.log('');

  // Test 3: Message truncation
  console.log('Test 3: Long message truncation (max 2000 chars)');
  contextManager.clearContext();

  const longMessage = 'A'.repeat(2500) + 'END';
  contextManager.storeMessage(longMessage);

  const retrievedMessages = contextManager.getStoredMessages();
  const truncatedMessage = retrievedMessages[0];

  if (truncatedMessage.length <= 2000 && truncatedMessage.includes('...[truncated]') && !truncatedMessage.includes('END')) {
    console.log('✅ PASS - Long message truncated correctly');
    console.log(`   Truncated length: ${truncatedMessage.length} chars`);
  } else {
    console.log('❌ FAIL - Message truncation failed');
    console.log(`   Message length: ${truncatedMessage.length}`);
    console.log(`   Contains truncation marker: ${truncatedMessage.includes('...[truncated]')}`);
  }
  console.log('');

  // Test 4: Context formatting for acolytes
  console.log('Test 4: Context formatting for acolytes');
  contextManager.clearContext();

  contextManager.storeMessage('I need to update the database schema');
  contextManager.storeMessage('Adding a new user table with authentication');
  contextManager.storeMessage('This will require updating the migration scripts');

  const formattedContext = contextManager.getContextForAcolytes();
  const expectedToContain = ['Recent Claude responses:', '1. This will require', '2. Adding a new user', '3. I need to update'];

  let contextFormatCorrect = true;
  for (const expected of expectedToContain) {
    if (!formattedContext.includes(expected)) {
      contextFormatCorrect = false;
      break;
    }
  }

  if (contextFormatCorrect) {
    console.log('✅ PASS - Context formatted correctly for acolytes');
  } else {
    console.log('❌ FAIL - Context formatting incorrect');
    console.log('Formatted context:', formattedContext);
  }
  console.log('');

  // Test 5: Empty context handling
  console.log('Test 5: Empty context handling');
  contextManager.clearContext();

  const emptyContext = contextManager.getContextForAcolytes();
  if (emptyContext === 'No recent context available.') {
    console.log('✅ PASS - Empty context handled correctly');
  } else {
    console.log('❌ FAIL - Empty context not handled correctly');
    console.log('Got:', emptyContext);
  }
  console.log('');

  // Test 6: Environment variable storage/retrieval
  console.log('Test 6: Environment variable storage and cleanup');
  contextManager.clearContext();

  // Store some messages
  contextManager.storeMessage('Test message 1');
  contextManager.storeMessage('Test message 2');

  // Check if environment variables are set
  const envVarsSet = process.env.COMA_CONTEXT_0 && process.env.COMA_CONTEXT_1;

  // Clear context
  contextManager.clearContext();

  // Check if environment variables are cleared
  const envVarsCleared = !process.env.COMA_CONTEXT_0 && !process.env.COMA_CONTEXT_1;

  if (envVarsSet && envVarsCleared) {
    console.log('✅ PASS - Environment variables managed correctly');
  } else {
    console.log('❌ FAIL - Environment variable management failed');
    console.log('Vars were set:', envVarsSet);
    console.log('Vars were cleared:', envVarsCleared);
  }
  console.log('');

  // Test 7: Context preservation across instances
  console.log('Test 7: Context preservation across ContextManager instances');
  const manager1 = new ContextManager();
  const manager2 = new ContextManager();

  manager1.clearContext();
  manager1.storeMessage('Shared message');

  const retrievedByManager2 = manager2.getStoredMessages();
  if (retrievedByManager2.length === 1 && retrievedByManager2[0] === 'Shared message') {
    console.log('✅ PASS - Context preserved across instances');
  } else {
    console.log('❌ FAIL - Context not preserved across instances');
    console.log('Retrieved by manager2:', retrievedByManager2);
  }
  console.log('');

  console.log('=== Context Capture Tests Complete ===');

  // Clean up
  contextManager.clearContext();
}

// Test the context capturer integration (mock test)
async function testContextCapturer() {
  console.log('\nTesting context capturer integration...\n');

  // Simulate hook data that would be passed to context-capturer.js
  const mockHookData = [
    {
      name: 'PostToolUse hook data',
      data: JSON.stringify({
        toolName: 'Edit',
        result: 'success',
        explanation: 'File edited successfully with proper validation'
      })
    },
    {
      name: 'UserPromptSubmit hook data',
      data: JSON.stringify({
        prompt: 'Please update the user interface',
        response: 'I will update the UI components to match the new design'
      })
    }
  ];

  console.log('Mock hook data scenarios:');
  for (const scenario of mockHookData) {
    console.log(`- ${scenario.name}: ${scenario.data.substring(0, 60)}...`);
  }

  console.log('\n✅ Context capturer integration ready for testing');
  console.log('   (Requires actual Claude Code session to test hook functionality)');
}

async function runAllTests() {
  try {
    await testContextCapture();
    await testContextCapturer();
    console.log('\n🎉 All context capture tests completed!');
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

runAllTests();