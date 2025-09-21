#!/usr/bin/env node

/**
 * Test script for COMA parallel acolyte system
 */

import { ClaudeCodeProvider } from '../src/providers/claude-code.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testParallelAcolytes() {
  console.log('Testing COMA parallel acolyte system...');

  // Load base prompt template
  const promptPath = path.join(__dirname, '..', 'src', 'prompts', 'base.md');
  const basePrompt = await fs.readFile(promptPath, 'utf8');

  const acolytes = [
    {
      id: 'acolyte1',
      file: 'src/claude-coma.js',
      systemPrompt: basePrompt.replace('{{FILE_PATH}}', 'src/claude-coma.js').replace('{{FILE_TYPE_GUIDELINES}}', '')
    },
    {
      id: 'acolyte2',
      file: 'src/coma-validator.js',
      systemPrompt: basePrompt.replace('{{FILE_PATH}}', 'src/coma-validator.js').replace('{{FILE_TYPE_GUIDELINES}}', '')
    },
    {
      id: 'acolyte3',
      file: 'package.json',
      systemPrompt: basePrompt.replace('{{FILE_PATH}}', 'package.json').replace('{{FILE_TYPE_GUIDELINES}}', '')
    }
  ];

  const toolData = {
    toolName: 'Edit',
    parameters: { file_path: 'src/claude-coma.js', old_string: 'claude-coma', new_string: 'claude-coma-v2' },
    claudeContext: 'Recent Claude responses:\n1. Updating the project name for version 2 release\n2. This is a minor change to the main launcher file'
  };

  // Test both providers
  const providers = [
    { name: 'Claude Code', provider: new ClaudeCodeProvider(process.cwd()) },
    ...(process.env.OPENAI_API_KEY ? [{ name: 'OpenAI', provider: new OpenAIProvider(process.cwd()) }] : [])
  ];

  for (const { name, provider } of providers) {
    console.log(`\n=== Testing ${name} Provider ===`);
    console.log(`Starting ${acolytes.length} ${name} acolytes in parallel`);
    const startTime = Date.now();

    try {
      // Spawn all acolytes in parallel using the provider
      const promises = acolytes.map(acolyte => provider.consultAcolyte(acolyte, toolData));
      const results = await Promise.all(promises);
      const endTime = Date.now();

      console.log(`All ${acolytes.length} acolytes completed in ${endTime - startTime}ms`);
      console.log('\nResults:');
      results.forEach((result, i) => {
        console.log(`\nAcolyte ${acolytes[i].id} (${acolytes[i].file}):`);
        console.log(`Decision: ${result.decision}`);
        console.log(`Reasoning: ${result.reasoning.substring(0, 150)}...`);
      });

    } catch (error) {
      console.error(`Error with ${name} provider:`, error.message);
    }
  }
}

testParallelAcolytes().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});