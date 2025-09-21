#!/usr/bin/env node

/**
 * Context Capturer for COMA
 * Captures Claude's explanations and context via PostToolUse hooks
 */

import { ContextManager } from './context-manager.js';

class ContextCapturer {
  constructor() {
    this.contextManager = new ContextManager();
  }

  /**
   * Handle PostToolUse hook to capture Claude's explanations
   */
  capturePostToolUse() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      process.exit(0);
    }

    try {
      // Parse tool result and any accompanying text
      const toolData = JSON.parse(args[0]);

      // Look for text that Claude might have provided with or after the tool use
      if (toolData.explanation || toolData.reasoning || toolData.text) {
        const claudeText = toolData.explanation || toolData.reasoning || toolData.text;
        this.contextManager.storeMessage(claudeText);
      }

      // For now, just log what we receive to understand the data structure
      console.error('COMA Context Capturer received:', JSON.stringify(toolData, null, 2));

    } catch (error) {
      console.error('COMA Context Capturer error:', error.message);
    }

    process.exit(0);
  }

  /**
   * Handle UserPromptSubmit hook to potentially capture responses
   */
  captureUserPromptSubmit() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      process.exit(0);
    }

    try {
      // This might capture both user prompts and Claude responses
      const promptData = JSON.parse(args[0]);

      // Log to understand structure
      console.error('COMA Context Capturer (UserPromptSubmit):', JSON.stringify(promptData, null, 2));

      // If this contains Claude's response, store it
      if (promptData.response || promptData.text) {
        const text = promptData.response || promptData.text;
        this.contextManager.storeMessage(text);
      }

    } catch (error) {
      console.error('COMA Context Capturer error:', error.message);
    }

    process.exit(0);
  }
}

// Determine which hook type called us based on command line or environment
const hookType = process.env.COMA_HOOK_TYPE || process.argv[2]?.split('_')[0];
const capturer = new ContextCapturer();

switch (hookType) {
  case 'PostToolUse':
    capturer.capturePostToolUse();
    break;
  case 'UserPromptSubmit':
    capturer.captureUserPromptSubmit();
    break;
  default:
    console.error('Unknown hook type:', hookType);
    process.exit(0);
}