#!/usr/bin/env node

/**
 * COMA Validator
 * Unified validator that uses provider system for acolyte consultation
 */

import fs from 'fs/promises';
import path from 'path';
import { ClaudeCodeProvider } from './providers/claude-code.js';
import { OpenAIProvider } from './providers/openai.js';
import { ContextManager } from './context-manager.js';

// Debug logging utility
function debugLog(message) {
  const logPath = process.env.CLAUDE_COMA_DEBUG;
  if (logPath) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const logEntry = `${timestamp} [${pid}] VALIDATOR: ${message}\n`;
    fs.appendFile(logPath, logEntry).catch(() => {});
  }
}

export class ComaValidator {
  constructor() {
    this.configDir = process.env.COMA_CONFIG_DIR;
    this.repoPath = process.env.COMA_REPO_PATH || process.cwd();
    this.provider = process.env.COMA_PROVIDER || 'claude-code';
    this.contextManager = new ContextManager();

    if (!this.configDir) {
      console.error('COMA: Configuration directory not set');
      process.exit(1);
    }

    // Initialize the appropriate provider
    if (this.provider === 'claude-code') {
      this.acolyteProvider = new ClaudeCodeProvider(this.repoPath);
    } else if (this.provider === 'openai') {
      this.acolyteProvider = new OpenAIProvider(this.repoPath);
    } else {
      console.error(`COMA: Unknown provider: ${this.provider}`);
      process.exit(1);
    }
  }

  async validate() {
    debugLog('Starting validation process');
    try {
      // Parse tool call from Claude Code
      const toolData = this.parseToolCall();
      debugLog(`Parsed tool data: ${JSON.stringify(toolData)}`);

      if (!toolData) {
        debugLog('No tool data provided - exiting');
        console.log('COMA: No tool data provided');
        process.exit(0);
      }

      // Check if this is a modification operation
      if (!this.isModificationOperation(toolData)) {
        debugLog(`${toolData.toolName} is not a modification operation - allowing`);
        process.exit(0); // Allow read operations
      }

      console.log(`COMA: Validating ${toolData.toolName} operation`);
      debugLog(`Validating ${toolData.toolName} operation`);

      // Get affected files
      const affectedFiles = this.getAffectedFiles(toolData);
      debugLog(`Affected files: ${JSON.stringify(affectedFiles)}`);

      // Load acolytes
      const acolytes = await this.loadAcolytes();
      debugLog(`Loaded ${acolytes.length} acolytes`);

      // Filter to relevant acolytes
      const relevantAcolytes = affectedFiles === 'ALL_FILES'
        ? acolytes
        : acolytes.filter(acolyte => affectedFiles.includes(acolyte.file));
      debugLog(`${relevantAcolytes.length} relevant acolytes selected`);

      if (relevantAcolytes.length === 0) {
        debugLog('No acolytes need to review - allowing change');
        console.log('COMA: No acolytes need to review this change');
        process.exit(0);
      }

      console.log(`COMA: Consulting ${relevantAcolytes.length} ${this.provider} acolytes`);
      debugLog(`Starting consultation with ${relevantAcolytes.length} ${this.provider} acolytes`);

      // Consult acolytes using selected provider
      const results = await this.consultAcolytes(relevantAcolytes, toolData);
      debugLog(`Consultation completed, evaluating consensus`);

      // Evaluate consensus
      const decision = this.evaluateConsensus(results);
      debugLog(`Consensus decision: ${decision.approved ? 'APPROVED' : 'REJECTED'}`);

      if (decision.approved) {
        console.log('COMA: Change approved by acolyte consensus');
        debugLog('Change approved - exiting with code 0');
        process.exit(0);
      } else {
        console.log('COMA: Change blocked by acolytes');
        console.log(decision.reasoning);
        debugLog(`Change blocked: ${decision.reasoning}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('COMA: Validation error:', error.message);
      debugLog(`Validation error: ${error.message}`);
      process.exit(1);
    }
  }

  parseToolCall() {
    const args = process.argv.slice(2);
    if (args.length === 0) return null;

    try {
      return JSON.parse(args[0]);
    } catch {
      return {
        toolName: args[0] || 'unknown',
        parameters: args.slice(1)
      };
    }
  }

  isModificationOperation(toolData) {
    const modificationTools = ['Edit', 'MultiEdit', 'Write', 'Bash'];
    return modificationTools.includes(toolData.toolName);
  }

  getAffectedFiles(toolData) {
    const { toolName, parameters } = toolData;

    switch (toolName) {
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
        if (parameters && parameters.file_path) {
          return [this.relativizePath(parameters.file_path)];
        }
        return [];

      case 'Bash':
        return 'ALL_FILES'; // Bash can affect any file

      default:
        return [];
    }
  }

  relativizePath(filePath) {
    return path.relative(this.repoPath, path.resolve(filePath));
  }

  async loadAcolytes() {
    try {
      const configPath = path.join(this.configDir, 'acolytes.json');
      const content = await fs.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load acolyte configurations: ${error.message}`);
    }
  }

  async consultAcolytes(acolytes, toolData) {
    console.log(`COMA: Starting ${acolytes.length} ${this.provider} acolytes in parallel`);
    debugLog(`Starting ${acolytes.length} acolytes in parallel using ${this.provider} provider`);

    // Get captured context from recent Claude responses
    const claudeContext = this.contextManager.getContextForAcolytes();
    debugLog(`Retrieved context: ${claudeContext ? claudeContext.length + ' chars' : 'none'}`);

    // Create enhanced tool data with context
    const enhancedToolData = {
      ...toolData,
      claudeContext: claudeContext
    };

    // Spawn all acolytes in parallel using the provider
    const promises = acolytes.map(acolyte => {
      debugLog(`Starting consultation with acolyte ${acolyte.id} for file ${acolyte.file}`);
      return this.acolyteProvider.consultAcolyte(acolyte, enhancedToolData)
        .then(result => {
          debugLog(`Acolyte ${acolyte.id} decision: ${result.decision}`);
          return {
            acolyteId: acolyte.id,
            file: acolyte.file,
            decision: result.decision,
            reasoning: result.reasoning
          };
        })
        .catch(error => {
          debugLog(`Acolyte ${acolyte.id} error: ${error.message}`);
          return {
            acolyteId: acolyte.id,
            file: acolyte.file,
            decision: 'ERROR',
            reasoning: error.message
          };
        });
    });

    // Wait for all acolytes to complete
    const results = await Promise.all(promises);
    console.log(`COMA: All ${acolytes.length} ${this.provider} acolytes completed consultation`);
    debugLog(`All acolytes completed. Results: ${results.map(r => `${r.file}:${r.decision}`).join(', ')}`);

    return results;
  }

  evaluateConsensus(results) {
    const approvals = results.filter(r => r.decision === 'APPROVE');
    const rejections = results.filter(r => r.decision === 'REJECT');
    const errors = results.filter(r => r.decision === 'ERROR');
    const unknown = results.filter(r => !['APPROVE', 'REJECT', 'ERROR'].includes(r.decision));

    // Any rejection blocks the operation
    if (rejections.length > 0) {
      return {
        approved: false,
        reasoning: `Operation blocked by ${rejections.length} acolyte(s):\n\n` +
          rejections.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Errors block the operation
    if (errors.length > 0) {
      return {
        approved: false,
        reasoning: `Acolyte consultation errors (${errors.length}):\n\n` +
          errors.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Unknown decision types block the operation
    if (unknown.length > 0) {
      return {
        approved: false,
        reasoning: `Unknown decision types from ${unknown.length} acolyte(s):\n\n` +
          unknown.map(r => `* ${r.file}: ${r.decision} - ${r.reasoning}`).join('\n\n')
      };
    }

    // All approvals
    return {
      approved: true,
      reasoning: `Unanimous approval from ${approvals.length} acolyte(s)`
    };
  }
}

// Run validation
const validator = new ComaValidator();
validator.validate();