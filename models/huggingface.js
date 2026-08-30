// ============================================================
//  models/huggingface.js — HuggingFace Inference Adapter
// ============================================================
import { Config } from '../config/index.js';
import { log }    from '../shared/logger.js';

const HF_MODEL = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
const HF_BASE  = Config.models.huggingfaceUrl;

export const HuggingFaceAdapter = {
  name: 'huggingface',

  async complete(prompt, options = {}) {
    const start = Date.now();
    const token = process.env.HF_API_KEY;
    if (!token) throw new Error('HF_API_KEY not set');

    log.model('HuggingFace', `→ ${HF_MODEL}`);

    const res = await fetch(`${HF_BASE}/models/${HF_MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: Config.models.maxTokens, temperature: options.temperature || 0.7 } }),
    });

    if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || '';

    return { text: text.replace(prompt, '').trim(), model: HF_MODEL, durationMs: Date.now() - start };
  },

  async embed(input) {
    // Delegate to OpenAI embeddings
    const { OpenAIAdapter } = await import('./openai.js');
    return OpenAIAdapter.embed(input);
  },
};