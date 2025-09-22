#!/usr/bin/env node

/**
 * COMA Validator
 * Unified validator that uses provider system for agent consultation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeCodeProvider } from './providers/claude-code.js';
import { OpenAIProvider } from './providers/openai.js';
import { ContextManager } from './context-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Debug logging utility
function debugLog(message) {
  const logPath = process.env.CLAUDE_COMA_DEBUG;
  if (logPath) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const logEntry = `${timestamp} [${pid}] VALIDATOR: ${message}\n`;
    try {
      fs.appendFileSync(logPath, logEntry);
    } catch (error) {
      // Fallback to async if sync fails
      fs.appendFile(logPath, logEntry).catch(() => {});
    }
  }
}

export class ComaValidator {
  constructor() {
    this.repoPath = process.env.COMA_REPO_PATH || process.cwd();
    this.provider = process.env.COMA_PROVIDER || 'claude-code';
    this.contextManager = new ContextManager();

    // Initialize the appropriate provider
    if (this.provider === 'claude-code') {
      this.agentProvider = new ClaudeCodeProvider(this.repoPath);
    } else if (this.provider === 'openai') {
      this.agentProvider = new OpenAIProvider(this.repoPath);
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

      // Load agents
      let agents;
      try {
        agents = await this.loadAcolytes();
        debugLog(`Loaded ${agents.length} agents`);
      } catch (error) {
        debugLog(`CRITICAL: Failed to load agents: ${error.message}`);
        console.error('COMA: Failed to load agent configurations:', error.message);
        process.exit(1);
      }

      // Filter to relevant agents using glob pattern matching
      const relevantAcolytes = affectedFiles === 'ALL_FILES'
        ? agents
        : agents.filter(agent => this.matchesFilePattern(affectedFiles, agent.file));
      debugLog(`${relevantAcolytes.length} relevant agents selected`);

      if (relevantAcolytes.length === 0) {
        debugLog('No agents need to review - allowing change');
        console.log('COMA: No agents need to review this change');
        process.exit(0);
      }

      console.log(`COMA: Consulting ${relevantAcolytes.length} ${this.provider} agents`);
      debugLog(`Starting consultation with ${relevantAcolytes.length} ${this.provider} agents`);

      // Consult agents using selected provider
      const results = await this.consultAcolytes(relevantAcolytes, toolData);
      debugLog(`Consultation completed, evaluating consensus`);

      // Evaluate consensus
      const decision = this.evaluateConsensus(results);
      debugLog(`Consensus decision: ${decision.approved ? 'APPROVED' : 'REJECTED'}`);
      if (!decision.approved) {
        debugLog(`Rejection reasoning: ${decision.reasoning}`);
      }

      if (decision.approved) {
        console.log('COMA: Change approved by agent consensus');
        debugLog('Change approved - exiting with code 0');
        process.exit(0);
      } else {
        console.log('COMA: Change blocked by agents');
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

  matchesFilePattern(affectedFiles, pattern) {
    // Check if any affected file matches the agent's pattern
    if (pattern.includes('**/*.')) {
      const extension = pattern.split('**/*.')[1];
      return affectedFiles.some(file => file.endsWith(`.${extension}`));
    }

    // Exact match fallback
    return affectedFiles.includes(pattern);
  }

  async loadAcolytes() {
    debugLog(`Generating agents dynamically for repository`);

    // Generate agents dynamically by scanning repository files
    const agents = await this.scanRepositoryForFiles();

    debugLog(`Generated ${agents.length} agents dynamically`);
    debugLog(`Acolyte IDs: ${agents.map(a => a.id).join(', ')}`);
    return agents;
  }

  async loadBasePromptTemplate() {
    try {
      const basePromptPath = path.join(__dirname, 'prompts', 'base.md');
      const basePrompt = await fs.readFile(basePromptPath, 'utf8');
      debugLog(`Loaded base prompt template: ${basePrompt.length} chars`);
      return basePrompt;
    } catch (error) {
      debugLog(`Failed to load base prompt template: ${error.message}`);
      // Fallback to simple prompt if base.md not found
      return `You are an agent protecting code files. Review changes for quality, security, and consistency.

Return APPROVE or REJECT with reasoning.`;
    }
  }

  createSystemPromptFromTemplate(baseTemplate, filePath, fileTypeGuidelines = '') {
    return baseTemplate
      .replace(/\{\{FILE_PATH\}\}/g, filePath)
      .replace(/\{\{FILE_TYPE_GUIDELINES\}\}/g, fileTypeGuidelines);
  }

  async scanRepositoryForFiles() {
    try {
      debugLog(`Scanning repository at: ${this.repoPath}`);

      // Load the base prompt template
      const basePrompt = await this.loadBasePromptTemplate();

      // For now, create a simple agent for common file types
      // This replaces the static agents.json approach
      const agents = [
        {
          id: 'agent_javascript_files',
          file: '**/*.js',
          systemPrompt: this.createSystemPromptFromTemplate(
            basePrompt,
            '**/*.js',
            `## JavaScript File Guidelines

This file contains JavaScript code. Pay special attention to:
- Modern ES6+ syntax and best practices
- Variable declarations (prefer const/let over var)
- Function design and modularity
- Error handling and edge cases
- Security implications of dynamic code execution`
          )
        },
        {
          id: 'agent_typescript_files',
          file: '**/*.ts',
          systemPrompt: this.createSystemPromptFromTemplate(
            basePrompt,
            '**/*.ts',
            `## TypeScript File Guidelines

This file contains TypeScript code. Pay special attention to:
- Type safety and correctness
- Interface and type definitions
- Generic usage and constraints
- Strict TypeScript compilation requirements
- Integration with JavaScript ecosystem`
          )
        }
      ];

      debugLog(`Created ${agents.length} dynamic agents with base.md template`);
      return agents;
    } catch (error) {
      debugLog(`Failed to scan repository: ${error.message}`);
      return [];
    }
  }

  async consultAcolytes(agents, toolData) {
    console.log(`COMA: Starting ${agents.length} ${this.provider} agents in parallel`);
    debugLog(`Starting ${agents.length} agents in parallel using ${this.provider} provider`);

    // Get captured context from recent Claude responses
    const claudeContext = this.contextManager.getContextForAgents();
    debugLog(`Retrieved context: ${claudeContext ? claudeContext.length + ' chars' : 'none'}`);
    if (claudeContext && claudeContext.length <= 1000) {
      debugLog(`Context content: ${claudeContext}`);
    }

    // Create enhanced tool data with context
    const enhancedToolData = {
      ...toolData,
      claudeContext: claudeContext
    };

    // Spawn all agents in parallel using the provider
    const promises = agents.map(agent => {
      debugLog(`Starting consultation with agent ${agent.id} for file ${agent.file}`);
      const consultationPromise = this.agentProvider.consultAgent(agent, enhancedToolData);

      // Add timeout logging
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          debugLog(`Acolyte ${agent.id} consultation taking longer than 10 seconds...`);
          resolve(null);
        }, 10000);
      });

      Promise.race([consultationPromise, timeoutPromise]);

      return consultationPromise
        .then(rawResponse => {
          debugLog(`Acolyte ${agent.id} completed consultation`);
          debugLog(`Acolyte ${agent.id} raw response: ${rawResponse}`);

          // Parse the raw response to extract decision
          const parsedResult = this.parseAgentResponse(rawResponse);
          debugLog(`Acolyte ${agent.id} decision: ${parsedResult.decision}`);
          debugLog(`Acolyte ${agent.id} reasoning: ${parsedResult.reasoning}`);

          return {
            agentId: agent.id,
            file: agent.file,
            decision: parsedResult.decision,
            reasoning: parsedResult.reasoning
          };
        })
        .catch(error => {
          debugLog(`Acolyte ${agent.id} consultation failed: ${error.message}`);
          return {
            agentId: agent.id,
            file: agent.file,
            decision: 'ERROR',
            reasoning: error.message
          };
        });
    });

    // Wait for all agents to complete
    const results = await Promise.all(promises);
    console.log(`COMA: All ${agents.length} ${this.provider} agents completed consultation`);
    debugLog(`All agents completed. Results: ${results.map(r => `${r.file}:${r.decision}`).join(', ')}`);

    return results;
  }

  parseAgentResponse(rawResponse) {
    // Parse the raw string response from the agent to extract decision and reasoning
    const cleanOutput = rawResponse.trim();

    // Look for decision keywords in the entire output
    if (cleanOutput.includes('APPROVE')) {
      return { decision: 'APPROVE', reasoning: cleanOutput };
    } else if (cleanOutput.includes('REJECT')) {
      return { decision: 'REJECT', reasoning: cleanOutput };
    } else {
      // If no clear decision, treat as reject for safety
      return { decision: 'REJECT', reasoning: `Unclear response: ${cleanOutput}` };
    }
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
        reasoning: `Operation blocked by ${rejections.length} agent(s):\n\n` +
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
        reasoning: `Unknown decision types from ${unknown.length} agent(s):\n\n` +
          unknown.map(r => `* ${r.file}: ${r.decision} - ${r.reasoning}`).join('\n\n')
      };
    }

    // All approvals
    return {
      approved: true,
      reasoning: `Unanimous approval from ${approvals.length} agent(s)`
    };
  }
}

// Run validation
debugLog('VALIDATOR SCRIPT STARTING');
try {
  const validator = new ComaValidator();
  debugLog('VALIDATOR INSTANCE CREATED');
  validator.validate();
} catch (error) {
  debugLog(`VALIDATOR STARTUP ERROR: ${error.message}`);
  console.error('COMA: Validator startup failed:', error.message);
  process.exit(1);
}