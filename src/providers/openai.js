/**
 * OpenAI Provider for COMA
 * Handles agent consultation using direct OpenAI API calls
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

  async consultAgent(agent, context) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI agent consultation timed out')), 30000)
    );

    const consultation = this.performConsultation(agent, context);

    return Promise.race([consultation, timeout]);
  }

  async performConsultation(agent, context) {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Add context if available
    const contextSection = context.claudeContext
      ? `\n\nCONTEXT FROM RECENT CLAUDE RESPONSES:\n${context.claudeContext}\n`
      : '';

    const instruction = `${agent.systemPrompt}${contextSection}

PROPOSED CHANGE:
Tool: ${context.toolName}
Parameters: ${JSON.stringify(context.parameters, null, 2)}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: "system",
            content: "You are an agent protecting code files. Analyze proposed changes and respond with APPROVE or REJECT."
          },
          {
            role: "user",
            content: instruction
          }
        ],
        temperature: 0.2
      });

      const result = response.choices[0]?.message?.content || "No response";

      // Return raw response as string per PROVIDERS.md spec
      return result.trim();

    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}