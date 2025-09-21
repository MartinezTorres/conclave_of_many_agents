#!/usr/bin/env node

/**
 * OpenAI Provider for COMA
 * Handles acolyte consultation using direct OpenAI API calls
 */

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class OpenAIProvider {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async consultAcolyte(acolyte, toolData) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI acolyte consultation timed out')), 30000)
    );

    const consultation = this.performConsultation(acolyte, toolData);

    return Promise.race([consultation, timeout]);
  }

  async performConsultation(acolyte, toolData) {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Load base prompt
    const promptPath = path.join(__dirname, '..', 'prompts', 'base.md');
    const basePrompt = await fs.readFile(promptPath, 'utf8');

    // Add context if available
    const contextSection = toolData.claudeContext
      ? `\n\nCONTEXT FROM RECENT CLAUDE RESPONSES:\n${toolData.claudeContext}\n`
      : '';

    const instruction = `${basePrompt.replace('{{FILE_PATH}}', acolyte.file).replace('{{FILE_TYPE_GUIDELINES}}', '')}${contextSection}

PROPOSED CHANGE:
Tool: ${toolData.toolName}
Parameters: ${JSON.stringify(toolData.parameters, null, 2)}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: "system",
            content: "You are an acolyte agent protecting code files. Analyze proposed changes and respond with APPROVE, REJECT, or NEEDS_CONTEXT."
          },
          {
            role: "user",
            content: instruction
          }
        ],
        temperature: 0.2
      });

      const result = response.choices[0]?.message?.content || "No response";
      return this.parseResponse(result);

    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  parseResponse(output) {
    // Clean up OpenAI's output
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