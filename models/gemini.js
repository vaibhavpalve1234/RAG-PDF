// ============================================================
// models/gemini.js — requires GEMINI_API_KEY in .env
// Not in your router's switch yet — add the case shown in
// models/index.js below to enable "gemini"/"google".
// ============================================================

import { Config } from '../config/index.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const GeminiAdapter = {
  name: 'gemini',

  async complete(prompt, options = {}) {
    const {
      system = '',
      temperature = Config.models.temperature,
      maxTokens = Config.models.maxTokens,
    } = options;

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `${API_BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const text = system ? `${system}\n\n${prompt}` : prompt;
    const start = Date.now();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const answer = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('');

    return {
      text: answer,
      model,
      usage: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0,
      },
      durationMs: Date.now() - start,
    };
  },

  async embed(input) {
    const isArray = Array.isArray(input);
    const texts = isArray ? input : [input];
    const model = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
    const vectors = [];

    for (const text of texts) {
      const url = `${API_BASE}/models/${model}:embedContent?key=${process.env.GEMINI_API_KEY}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
      });

      if (!res.ok) {
        throw new Error(`Gemini embeddings HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      vectors.push(data.embedding?.values || []);
    }

    return isArray ? vectors : vectors[0];
  },
};