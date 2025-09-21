#!/usr/bin/env node

/**
 * Claude Code Provider for COMA
 * Handles acolyte consultation using parallel Claude Code sessions
 */

import { spawn } from 'child_process';

export class ClaudeCodeProvider {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async consultAcolyte(acolyte, toolData) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Claude Code acolyte consultation timed out'));
      }, 60000); // 60 second timeout for Claude sessions

      // Create instruction for Claude acolyte
      const instruction = `${acolyte.systemPrompt}

PROPOSED CHANGE:
Tool: ${toolData.toolName}
Parameters: ${JSON.stringify(toolData.parameters, null, 2)}

Your file: ${acolyte.file}

TASK: Analyze if this proposed change is compatible with your assigned file. Consider:
1. File structure and purpose
2. Dependencies and relationships
3. Potential breaking changes
4. Code consistency

RESPONSE FORMAT: End your response with exactly one of:
- APPROVE (if change is safe and compatible)
- REJECT (if change would cause issues - explain why)
- NEEDS_CONTEXT (if you need more information)

Begin your analysis:`;

      // Spawn Claude Code session
      const claudeProcess = spawn('claude', [
        '--print',
        instruction
      ], {
        cwd: this.repoPath,
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
          reject(new Error(`Claude Code acolyte failed: ${errorOutput}`));
          return;
        }

        try {
          const response = this.parseResponse(output);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse Claude Code acolyte response: ${error.message}`));
        }
      });

      claudeProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude Code acolyte: ${error.message}`));
      });

      // Claude doesn't need stdin input for --print mode
      claudeProcess.stdin.end();
    });
  }

  parseResponse(output) {
    // Clean up Claude's output
    const cleanOutput = output.trim();

    // Look for decision keywords in the entire output
    if (cleanOutput.includes('APPROVE')) {
      return { decision: 'APPROVE', reasoning: cleanOutput };
    } else if (cleanOutput.includes('REJECT')) {
      return { decision: 'REJECT', reasoning: cleanOutput };
    } else if (cleanOutput.includes('NEEDS_CONTEXT')) {
      return { decision: 'NEEDS_CONTEXT', reasoning: cleanOutput };
    } else {
      // If no clear decision, treat as needs more context
      return { decision: 'UNCLEAR', reasoning: cleanOutput };
    }
  }
}