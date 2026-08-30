// ============================================================
// models/nvidia.js
// NVIDIA NIM adapter using the OpenAI SDK
// ============================================================

import OpenAI from "openai";
import { Config } from "../config/index.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const DEFAULT_MODEL = "deepseek-ai/deepseek-v4-pro-0813";

// ============================================================
// CLIENT
// ============================================================

function createClient() {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is missing in .env");
  }

  return new OpenAI({
    apiKey,
    baseURL: NVIDIA_BASE_URL,
  });
}

// ============================================================
// ADAPTER
// ============================================================

export const NvidiaAdapter = {
  name: "nvidia",

  async complete(prompt, options = {}) {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("NVIDIA complete(): prompt must be a non-empty string");
    }

    const {
      system = "",

      temperature = Config.models?.temperature ?? 0.1,

      maxTokens = Config.models?.maxTokens ?? 2048,
    } = options;

    const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;

    const client = createClient();

    const messages = [];

    if (system) {
      messages.push({
        role: "system",
        content: system,
      });
    }

    messages.push({
      role: "user",
      content: prompt,
    });

    const start = Date.now();

    const completion = await client.chat.completions.create({
      model,

      messages,

      temperature,

      top_p: 0.95,

      max_tokens: maxTokens,

      seed: 42,

      chat_template_kwargs: {
        thinking: false,
      },

      stream: false,
    });

    const answer = completion.choices?.[0]?.message?.content || "";

    return {
      text: answer,

      model,

      usage: {
        input: completion.usage?.prompt_tokens ?? 0,

        output: completion.usage?.completion_tokens ?? 0,

        total: completion.usage?.total_tokens ?? 0,
      },

      durationMs: Date.now() - start,
    };
  },
};
