# Provider Implementation Guide

## Overview

Providers are the generic LLM interface layer in COMA. They handle communication with different AI models and return raw responses. Providers should work with any type of agent and should not impose specific response formats - the expected format is defined by the agent's prompt or schema.

## Design Requirements

- **Stateless**: Providers must not create or depend on persistent files
- **Timeout handling**: Must implement reasonable timeouts to prevent hanging
- **Error safety**: Should default to REJECT when decisions are unclear
- **Parallel execution**: The `consultAgent` method must be reentrant and non-blocking. Multiple concurrent calls to `consultAgent` should be supported, with each consultation running independently

## Interface Requirements

A provider must export a class with the following interface:

### Constructor
```javascript
constructor(repoPath)
```
- `repoPath`: Absolute path to the repository

### Method
```javascript
async consultAgent(agent, consultation)
```

**Parameters:**
- `agent`: Object with properties:
  - `id`: String identifier
  - `systemPrompt`: Instructions for the AI model
- `consultation`: Object containing the data to be analyzed (provider should treat this generically)

**Returns:**
Promise resolving to string containing the raw AI response. The format and structure of this response is determined by the agent's prompt, not by the provider.

**Requirements:**
- **Timeout**: Must implement a reasonable timeout (recommended: 60 seconds) to prevent hanging consultations
- **Generic handling**: Provider must not interpret consultation object structure - pass it generically to the AI model
- **Error handling**: Should reject with descriptive error messages on failure