/**
 * Claude Code Provider for COMA
 * Handles agent consultation using parallel Claude Code sessions
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Debug logging utility
function debugLog(message) {
  const logPath = process.env.CLAUDE_COMA_DEBUG;
  if (logPath) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const logEntry = `${timestamp} [${pid}] CLAUDE-CODE-PROVIDER: ${message}\n`;
    fs.appendFile(logPath, logEntry).catch(() => {});
  }
}

export class ClaudeCodeProvider {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async consultAgent(agent, consultation) {
    debugLog(`Starting consultation with agent ${agent.id}`);

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        debugLog(`Agent ${agent.id} consultation timed out after 60 seconds`);
        reject(new Error('Claude Code agent consultation timed out'));
      }, 60000); // 60 second timeout for Claude sessions

      try {
        debugLog(`Creating instruction for agent ${agent.id}`);
        debugLog(`Consultation data: ${JSON.stringify(consultation)}`);
        debugLog(`Agent system prompt length: ${agent.systemPrompt.length} chars`);

        // Create instruction with generic consultation data
        // The agent's system prompt should define how to interpret the consultation
        const instruction = `${agent.systemPrompt}

CONSULTATION DATA:
${JSON.stringify(consultation, null, 2)}

Begin your analysis:`;

        debugLog(`Agent ${agent.id} full instruction: "${instruction}"`);
        debugLog(`Spawning Claude Code process for agent ${agent.id}`);
        debugLog(`Command: claude --allowed-tools Read,Grep,Glob,WebFetch,WebSearch --print [instruction]`);
        debugLog(`Working directory: ${this.repoPath}`);

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
          const chunk = data.toString();
          debugLog(`Agent ${agent.id} stdout chunk: ${chunk.length} chars - "${chunk}"`);
          output += chunk;
        });

        claudeProcess.stderr.on('data', (data) => {
          const chunk = data.toString();
          debugLog(`Agent ${agent.id} stderr chunk: ${chunk.length} chars - "${chunk}"`);
          errorOutput += chunk;
        });

        claudeProcess.on('close', (code) => {
          debugLog(`Agent ${agent.id} process closed with code ${code}`);
          debugLog(`Agent ${agent.id} total output: ${output.length} chars`);
          debugLog(`Agent ${agent.id} total error: ${errorOutput.length} chars`);
          clearTimeout(timeout);

          if (code !== 0) {
            debugLog(`Agent ${agent.id} failed with error: ${errorOutput}`);
            reject(new Error(`Claude Code agent failed: ${errorOutput}`));
            return;
          }

          debugLog(`Agent ${agent.id} consultation completed successfully`);
          // Return raw response as string per PROVIDERS.md spec
          resolve(output.trim());
        });

        claudeProcess.on('error', (error) => {
          debugLog(`Agent ${agent.id} spawn error: ${error.message}`);
          clearTimeout(timeout);
          reject(new Error(`Failed to spawn Claude Code agent: ${error.message}`));
        });

        debugLog(`Agent ${agent.id} process spawned, waiting for response...`);
        // Claude doesn't need stdin input for --print mode
        claudeProcess.stdin.end();
      } catch (error) {
        debugLog(`Agent ${agent.id} instruction creation failed: ${error.message}`);
        clearTimeout(timeout);
        reject(new Error(`Failed to create instruction: ${error.message}`));
      }
    });
  }
}