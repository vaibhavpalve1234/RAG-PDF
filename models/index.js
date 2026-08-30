// ============================================================
//  models/index.js — Model Router
//  Returns the correct model adapter by name
// ============================================================
import { Config } from "../config/index.js";
import { log } from "../shared/logger.js";

const _cache = new Map();

/**
 * Get a model adapter by name.
 * @param {'openai'|'claude'|'ollama'|'huggingface'|'gemini'|string} name
 * @returns {Promise<ModelAdapter>}
 *
 * ModelAdapter interface:
 *   complete(prompt, options) → { text, model, usage, durationMs }
 *   embed(text)               → number[]
 */
export async function getModel(name) {
  const key = name || Config.models.default;
  if (_cache.has(key)) return _cache.get(key);

  let adapter;
  switch (key) {
    case "openai":
    case "gpt":
    case "gpt-4o":
      adapter = await import("./openai.js").then((m) => m.OpenAIAdapter);
      break;
    case "claude":
    case "anthropic":
      adapter = await import("./claude.js").then((m) => m.ClaudeAdapter);
      break;
    case "ollama":
      adapter = await import("./ollama.js").then((m) => m.OllamaAdapter);
      break;
    case "gemini":
    case "google":
      adapter = await import("./gemini.js").then((m) => m.GeminiAdapter);
      break;
    case "huggingface":
    case "hf":
      adapter = await import("./huggingface.js").then(
        (m) => m.HuggingFaceAdapter,
      );
      break;
    case "nvidia":
      console.log("nvidia")
      adapter = await import("./nvidia.js").then((m) => m.NvidiaAdapter);
      break;
    default:
      log.warn(`Unknown model "${key}", falling back to OpenAI`);
      adapter = await import("./openai.js").then((m) => m.OpenAIAdapter);
  }

  _cache.set(key, adapter);
  return adapter;
}

/** List all available model names. */
export function listModels() {
  return ["openai", "claude", "ollama", "gemini", "huggingface"];
}
