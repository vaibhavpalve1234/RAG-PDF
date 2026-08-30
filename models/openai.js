// ============================================================
// models/openai.js — requires OPENAI_API_KEY in .env
// ============================================================

import { Config } from '../config/index.js';

const API_URL = 'https://api.openai.com/v1';

export const OpenAIAdapter = {
  name: 'openai',

  async complete(prompt, options = {}) {
    const {
      system = '',
      temperature = Config.models.temperature,
      maxTokens = Config.models.maxTokens,
    } = options;

    const model = Config.models.openai;

    const messages = system
      ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }];

    const start = Date.now();

    const res = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();

    return {
      text: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
      durationMs: Date.now() - start,
    };
  },

  async embed(input) {
    const isArray = Array.isArray(input);
    const texts = isArray ? input : [input];
    const model = Config.models.openaiEmbed || 'text-embedding-3-small';

    const res = await fetch(`${API_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embeddings HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const vectors = data.data.map((d) => d.embedding);

    return isArray ? vectors : vectors[0];
  },
};