#!/usr/bin/env node

/**
 * Test script for parallel Claude acolytes
 */

import { spawn } from 'child_process';

async function testParallelAcolytes() {
  console.log('Testing parallel Claude acolytes...');

  const acolytes = [
    { id: 'acolyte1', file: 'math.js', systemPrompt: 'You protect mathematical functions.' },
    { id: 'acolyte2', file: 'utils.js', systemPrompt: 'You protect utility functions.' },
    { id: 'acolyte3', file: 'api.js', systemPrompt: 'You protect API endpoints.' }
  ];

  const toolData = {
    toolName: 'Edit',
    parameters: { file_path: 'math.js', old_string: 'add', new_string: 'sum' }
  };

  console.log(`Starting ${acolytes.length} Claude acolytes in parallel`);
  const startTime = Date.now();

  // Spawn all acolytes in parallel
  const promises = acolytes.map(acolyte => consultClaudeAcolyte(acolyte, toolData));

  try {
    const results = await Promise.all(promises);
    const endTime = Date.now();

    console.log(`All ${acolytes.length} acolytes completed in ${endTime - startTime}ms`);
    console.log('\nResults:');
    results.forEach((result, i) => {
      console.log(`\nAcolyte ${acolytes[i].id}:`);
      console.log(`Decision: ${result.decision}`);
      console.log(`Reasoning: ${result.reasoning.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

function consultClaudeAcolyte(acolyte, toolData) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Claude acolyte consultation timed out'));
    }, 30000);

    const instruction = `${acolyte.systemPrompt}

PROPOSED CHANGE:
Tool: ${toolData.toolName}
Parameters: ${JSON.stringify(toolData.parameters, null, 2)}

Your file: ${acolyte.file}

TASK: Analyze if this change is compatible with your file. Respond with APPROVE, REJECT, or NEEDS_CONTEXT.`;

    const claudeProcess = spawn('claude', ['--print', instruction], {
      cwd: '/tmp/test-claude-acolyte',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    claudeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    claudeProcess.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(`Claude acolyte failed: ${errorOutput}`));
        return;
      }

      // Parse response
      const cleanOutput = output.trim();
      let decision = 'UNCLEAR';

      if (cleanOutput.includes('APPROVE')) {
        decision = 'APPROVE';
      } else if (cleanOutput.includes('REJECT')) {
        decision = 'REJECT';
      } else if (cleanOutput.includes('NEEDS_CONTEXT')) {
        decision = 'NEEDS_CONTEXT';
      }

      resolve({ decision, reasoning: cleanOutput });
    });

    claudeProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Claude acolyte: ${error.message}`));
    });

    claudeProcess.stdin.end();
  });
}

testParallelAcolytes();