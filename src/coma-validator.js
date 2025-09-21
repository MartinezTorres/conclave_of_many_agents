#!/usr/bin/env node

/**
 * COMA Validator
 * Unified validator that uses provider system for acolyte consultation
 */

import fs from 'fs/promises';
import path from 'path';
import { ClaudeCodeProvider } from './providers/claude-code.js';
import { OpenAIProvider } from './providers/openai.js';

class ComaValidator {
  constructor() {
    this.configDir = process.env.COMA_CONFIG_DIR;
    this.repoPath = process.env.COMA_REPO_PATH || process.cwd();
    this.provider = process.env.COMA_PROVIDER || 'claude-code';

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
    try {
      // Parse tool call from Claude Code
      const toolData = this.parseToolCall();

      if (!toolData) {
        console.log('COMA: No tool data provided');
        process.exit(0);
      }

      // Check if this is a modification operation
      if (!this.isModificationOperation(toolData)) {
        process.exit(0); // Allow read operations
      }

      console.log(`COMA: Validating ${toolData.toolName} operation`);

      // Get affected files
      const affectedFiles = this.getAffectedFiles(toolData);

      // Load acolytes
      const acolytes = await this.loadAcolytes();

      // Filter to relevant acolytes
      const relevantAcolytes = affectedFiles === 'ALL_FILES'
        ? acolytes
        : acolytes.filter(acolyte => affectedFiles.includes(acolyte.file));

      if (relevantAcolytes.length === 0) {
        console.log('COMA: No acolytes need to review this change');
        process.exit(0);
      }

      console.log(`COMA: Consulting ${relevantAcolytes.length} ${this.provider} acolytes`);

      // Consult acolytes using selected provider
      const results = await this.consultAcolytes(relevantAcolytes, toolData);

      // Evaluate consensus
      const decision = this.evaluateConsensus(results);

      if (decision.approved) {
        console.log('COMA: Change approved by acolyte consensus');
        process.exit(0);
      } else {
        console.log('COMA: Change blocked by acolytes');
        console.log(decision.reasoning);
        process.exit(1);
      }

    } catch (error) {
      console.error('COMA: Validation error:', error.message);
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

    // Spawn all acolytes in parallel using the provider
    const promises = acolytes.map(acolyte =>
      this.acolyteProvider.consultAcolyte(acolyte, toolData)
        .then(result => ({
          acolyteId: acolyte.id,
          file: acolyte.file,
          decision: result.decision,
          reasoning: result.reasoning
        }))
        .catch(error => ({
          acolyteId: acolyte.id,
          file: acolyte.file,
          decision: 'ERROR',
          reasoning: error.message
        }))
    );

    // Wait for all acolytes to complete
    const results = await Promise.all(promises);
    console.log(`COMA: All ${acolytes.length} ${this.provider} acolytes completed consultation`);

    return results;
  }

  evaluateConsensus(results) {
    const approvals = results.filter(r => r.decision === 'APPROVE');
    const rejections = results.filter(r => r.decision === 'REJECT');
    const needsContext = results.filter(r => r.decision === 'NEEDS_CONTEXT');
    const errors = results.filter(r => r.decision === 'ERROR');

    // Any rejection blocks the operation
    if (rejections.length > 0) {
      return {
        approved: false,
        reasoning: `Operation blocked by ${rejections.length} acolyte(s):\n\n` +
          rejections.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Need context blocks the operation
    if (needsContext.length > 0) {
      return {
        approved: false,
        reasoning: `Operation requires more context from ${needsContext.length} acolyte(s):\n\n` +
          needsContext.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
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