// ============================================================
// models/claude.js — requires ANTHROPIC_API_KEY in .env
// ============================================================

import { Config } from '../config/index.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

export const ClaudeAdapter = {
  name: 'claude',

  async complete(prompt, options = {}) {
    const {
      system = '',
      temperature = Config.models.temperature,
      maxTokens = Config.models.maxTokens,
    } = options;

    const model = Config.models.claude;
    const start = Date.now();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      text,
      model: data.model || model,
      usage: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
      },
      durationMs: Date.now() - start,
    };
  },

  // No first-party Anthropic embeddings API.
  // Set EMBEDDINGS_PROVIDER=openai (or ollama) in .env, or leave unset
  // to fall back to the built-in hash embedding in rag-service.js.
  async embed() {
    throw new Error(
      'Claude has no embeddings endpoint. Set EMBEDDINGS_PROVIDER to "openai" or "ollama" in .env.',
    );
  },
};