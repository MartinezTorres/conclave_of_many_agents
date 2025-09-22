/**
 * Context Capturer for COMA
 * Captures Claude's explanations and context via PostToolUse hooks
 */

import { ContextManager } from './context-manager.js';
import fs from 'fs/promises';

// Debug logging utility
function debugLog(message) {
  const logPath = process.env.CLAUDE_COMA_DEBUG;
  if (logPath) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const logEntry = `${timestamp} [${pid}] CONTEXT: ${message}\n`;
    fs.appendFile(logPath, logEntry).catch(() => {});
  }
}

class ContextCapturer {
  constructor() {
    this.contextManager = new ContextManager();
  }

  /**
   * Handle PostToolUse hook to capture Claude's explanations
   */
  capturePostToolUse() {
    debugLog('PostToolUse hook triggered');
    const args = process.argv.slice(2);

    if (args.length === 0) {
      debugLog('No arguments provided to PostToolUse');
      process.exit(0);
    }

    try {
      // Parse tool result and any accompanying text
      const toolData = JSON.parse(args[0]);
      debugLog(`Received tool data: ${JSON.stringify(toolData).substring(0, 200)}...`);

      // Look for text that Claude might have provided with or after the tool use
      if (toolData.explanation || toolData.reasoning || toolData.text) {
        const claudeText = toolData.explanation || toolData.reasoning || toolData.text;
        debugLog(`Storing Claude text: ${claudeText.substring(0, 100)}...`);
        this.contextManager.storeMessage(claudeText);
      } else {
        debugLog('No Claude text found in tool data');
      }

      // For now, just log what we receive to understand the data structure
      console.error('COMA Context Capturer received:', JSON.stringify(toolData, null, 2));

    } catch (error) {
      console.error('COMA Context Capturer error:', error.message);
      debugLog(`PostToolUse error: ${error.message}`);
    }

    debugLog('PostToolUse completed');
    process.exit(0);
  }

  /**
   * Handle UserPromptSubmit hook to potentially capture responses
   */
  captureUserPromptSubmit() {
    debugLog('UserPromptSubmit hook triggered');
    const args = process.argv.slice(2);

    if (args.length === 0) {
      debugLog('No arguments provided to UserPromptSubmit');
      process.exit(0);
    }

    try {
      // This might capture both user prompts and Claude responses
      const promptData = JSON.parse(args[0]);
      debugLog(`Received prompt data: ${JSON.stringify(promptData).substring(0, 200)}...`);

      // Log to understand structure
      console.error('COMA Context Capturer (UserPromptSubmit):', JSON.stringify(promptData, null, 2));

      // If this contains Claude's response, store it
      if (promptData.response || promptData.text) {
        const text = promptData.response || promptData.text;
        debugLog(`Storing prompt text: ${text.substring(0, 100)}...`);
        this.contextManager.storeMessage(text);
      } else {
        debugLog('No response text found in prompt data');
      }

    } catch (error) {
      console.error('COMA Context Capturer error:', error.message);
      debugLog(`UserPromptSubmit error: ${error.message}`);
    }

    debugLog('UserPromptSubmit completed');
    process.exit(0);
  }
}

// Determine which hook type called us based on command line or environment
const hookType = process.env.COMA_HOOK_TYPE || process.argv[2]?.split('_')[0];
const capturer = new ContextCapturer();

debugLog(`Context capturer started with hook type: ${hookType}`);

switch (hookType) {
  case 'PostToolUse':
    capturer.capturePostToolUse();
    break;
  case 'UserPromptSubmit':
    capturer.captureUserPromptSubmit();
    break;
  default:
    console.error('Unknown hook type:', hookType);
    debugLog(`Unknown hook type: ${hookType}`);
    process.exit(0);
}