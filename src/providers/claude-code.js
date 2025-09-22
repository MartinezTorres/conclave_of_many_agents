/**
 * Claude Code Provider for COMA
 * Handles agent consultation using parallel Claude Code sessions
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ClaudeCodeProvider {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async consultAgent(agent, context) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Claude Code agent consultation timed out'));
      }, 60000); // 60 second timeout for Claude sessions

      try {
        // Create instruction for Claude agent
        const contextSection = context.claudeContext
          ? `\n\nCONTEXT FROM RECENT CLAUDE RESPONSES:\n${context.claudeContext}\n`
          : '';

        const instruction = `${agent.systemPrompt}${contextSection}

PROPOSED CHANGE:
Tool: ${context.toolName}
Parameters: ${JSON.stringify(context.parameters, null, 2)}

Begin your analysis:`;

        // Spawn Claude Code session with read-only tools
        const claudeProcess = spawn('claude', [
          '--allowed-tools', 'Read,Grep,Glob,WebFetch,WebSearch',
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
            reject(new Error(`Claude Code agent failed: ${errorOutput}`));
            return;
          }

          // Return raw response as string per PROVIDERS.md spec
          resolve(output.trim());
        });

        claudeProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to spawn Claude Code agent: ${error.message}`));
        });

        // Claude doesn't need stdin input for --print mode
        claudeProcess.stdin.end();
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Failed to create instruction: ${error.message}`));
      }
    });
  }
}