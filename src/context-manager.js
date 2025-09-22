/**
 * Context Manager for COMA
 * Captures and manages Claude's recent text output for agent context
 */

export class ContextManager {
  constructor() {
    this.maxMessages = 5;
    this.maxMessageLength = 2000; // Truncate very long messages
  }

  /**
   * Store Claude's recent message in environment variables
   */
  storeMessage(message) {
    // Get existing messages from environment
    const messages = this.getStoredMessages();

    // Add new message (truncated if needed)
    const truncationSuffix = '...[truncated]';
    const truncatedMessage = message.length > this.maxMessageLength
      ? message.substring(0, this.maxMessageLength - truncationSuffix.length) + truncationSuffix
      : message;

    messages.unshift(truncatedMessage);

    // Keep only last N messages
    messages.splice(this.maxMessages);

    // Store back to environment
    this.storeMessages(messages);
  }

  /**
   * Get stored messages from environment variables
   */
  getStoredMessages() {
    const messages = [];
    for (let i = 0; i < this.maxMessages; i++) {
      const msg = process.env[`COMA_CONTEXT_${i}`];
      if (msg) {
        messages.push(msg);
      }
    }
    return messages;
  }

  /**
   * Store messages to environment variables
   */
  storeMessages(messages) {
    // Clear existing
    for (let i = 0; i < this.maxMessages; i++) {
      delete process.env[`COMA_CONTEXT_${i}`];
    }

    // Store new messages
    messages.forEach((msg, index) => {
      process.env[`COMA_CONTEXT_${index}`] = msg;
    });
  }

  /**
   * Get formatted context for agents
   */
  getContextForAgents() {
    const messages = this.getStoredMessages();
    if (messages.length === 0) {
      return 'No recent context available.';
    }

    return 'Recent Claude responses:\n' +
           messages.map((msg, i) => `${i + 1}. ${msg}`).join('\n\n');
  }

  /**
   * Clear all stored context
   */
  clearContext() {
    this.storeMessages([]);
  }
}