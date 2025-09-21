/**
 * Claude Code Provider for COMA
 * Handles acolyte consultation using parallel Claude Code sessions
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

  async consultAcolyte(acolyte, toolData) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Claude Code acolyte consultation timed out'));
      }, 60000); // 60 second timeout for Claude sessions

      try {
        // Load base prompt
        const promptPath = path.join(__dirname, '..', 'prompts', 'base.md');
        const basePrompt = await fs.readFile(promptPath, 'utf8');

        // Create instruction for Claude acolyte
        const contextSection = toolData.claudeContext
          ? `\n\nCONTEXT FROM RECENT CLAUDE RESPONSES:\n${toolData.claudeContext}\n`
          : '';

        const instruction = `${basePrompt.replace('{{FILE_PATH}}', acolyte.file).replace('{{FILE_TYPE_GUIDELINES}}', '')}${contextSection}

PROPOSED CHANGE:
Tool: ${toolData.toolName}
Parameters: ${JSON.stringify(toolData.parameters, null, 2)}

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
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Failed to load prompt: ${error.message}`));
      }
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