

// ============================================================
// models/ollama.js — Local model adapter (no API key needed)
// ============================================================

import { Config } from "../config/index.js";
import { log } from "../shared/logger.js";

export const OllamaAdapter = {
  name: "ollama",

  async complete(prompt, options = {}) {
    const { system = "", temperature = 0, maxTokens = 200 } = options;
    const start = Date.now();

    const model = Config.models.ollama || "llama3.2:3b";
    const url = `${Config.models.ollamaUrl}/api/generate`;

    log.model?.("Ollama", `→ ${model} @ ${Config.models.ollamaUrl}`);

    const finalPrompt = system ? `${system}\n\n${prompt}` : prompt;

    const body = {
      model,
      prompt: finalPrompt,
      stream: false,
      options: {
        // FIX: was hardcoded to 0, ignoring the caller's temperature.
        temperature,
        num_ctx: 2048,
        num_predict: maxTokens,
      },
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(1800000, () => controller.abort()); // 30 min
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();

      return {
        text: data.response || "",
        model: data.model || model,
        usage: {
          input: data.prompt_eval_count || 0,
          output: data.eval_count || 0,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      log.warn(`Ollama error (${err.message})`);
      throw err;
    }
  },

  async chat(messages, options = {}) {
    const { temperature = 0.2, maxTokens = 50 } = options;
    const start = Date.now();

    const model = Config.models.ollama || "llama3.2:3b";
    const url = `${Config.models.ollamaUrl}/api/chat`;

    const body = {
      model,
      messages,
      stream: false,
      options: { temperature, num_ctx: 2048, num_predict: maxTokens },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama chat HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();

      return {
        text: data.message?.content || "",
        model: data.model || model,
        usage: {
          input: data.prompt_eval_count || 0,
          output: data.eval_count || 0,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      log.warn(`Ollama chat error (${err.message})`);
      throw err;
    }
  },

  async embed(input) {
    const isArray = Array.isArray(input);
    const texts = isArray ? input : [input];

    const model = Config.models.ollamaEmbed || "nomic-embed-text:latest";
    const url = `${Config.models.ollamaUrl}/api/embeddings`;

    const vectors = [];

    for (const text of texts) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama embeddings HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();

      if (!Array.isArray(data.embedding)) {
        throw new Error("Ollama did not return an embedding vector");
      }

      vectors.push(data.embedding);
    }

    return isArray ? vectors : vectors[0];
  },
};




// // ============================================================
// // models/ollama.js
// // Ollama Local Model Adapter
// // ============================================================

// import { Config } from "../config/index.js";
// import { log } from "../shared/logger.js";

// export const OllamaAdapter = {
//   name: "ollama",

//   // ==========================================================
//   // TEXT COMPLETION
//   // ==========================================================

//   async complete(prompt, options = {}) {
//     const { system = "", temperature = 0, maxTokens = 50 } = options;

//     const start = Date.now();

//     // Use llama3.2:3b for CPU-only laptop
//     const model = Config.models.ollama || "llama3.2:3b";

//     const url = `${Config.models.ollamaUrl}/api/generate`;

//     log.model("Ollama", `→ ${model} @ ${Config.models.ollamaUrl}`);

//     // Combine system instruction + RAG prompt
//     const finalPrompt = system ? `${system}\n\n${prompt}` : prompt;

//     // ========================================================
//     // IMPORTANT FOR YOUR LAPTOP
//     //
//     // num_ctx: 2048
//     // Keeps Ollama memory usage low.
//     //
//     // num_predict: 50
//     // Prevents unnecessarily long answers.
//     // ========================================================

//     const body = {
//       model,

//       prompt: finalPrompt,

//       stream: false,

//       options: {
//         temperature: 0,
//         num_ctx: 2048,
//         num_predict: maxTokens,
//       },
//     };

//     console.log("=================================");
//     console.log("OLLAMA REQUEST");
//     console.log("Model:", model);
//     console.log("Context:", 2048);
//     console.log("Max tokens:", maxTokens);
//     console.log("Prompt length:", finalPrompt.length);
//     console.log("=================================");

//     try {
//       const res = await fetch(url, {
//         method: "POST",

//         headers: {
//           "Content-Type": "application/json",
//         },

//         body: JSON.stringify(body),
//       });

//       // Don't console.log(res)
//       // It prints the entire Response object.

//       if (!res.ok) {
//         const errorText = await res.text();

//         throw new Error(`Ollama HTTP ${res.status}: ${errorText}`);
//       }

//       const data = await res.json();

//       console.log("✅ Ollama response received");

//       return {
//         text: data.response || "",

//         model: data.model || model,

//         usage: {
//           input: data.prompt_eval_count || 0,

//           output: data.eval_count || 0,
//         },

//         durationMs: Date.now() - start,
//       };
//     } catch (err) {
//       log.warn(`Ollama error (${err.message})`);

//       throw err;
//     }
//   },

//   // ==========================================================
//   // CHAT
//   // ==========================================================

//   async chat(messages, options = {}) {
//     const { temperature = 0, maxTokens = 50 } = options;

//     const start = Date.now();

//     const model = Config.models.ollama || "llama3.2:3b";

//     const url = `${Config.models.ollamaUrl}/api/chat`;

//     const body = {
//       model,

//       messages,

//       stream: false,

//       options: {
//         temperature: 0,
//         num_ctx: 2048,
//         num_predict: maxTokens,
//       },
//     };

//     console.log("=================================");
//     console.log("OLLAMA CHAT REQUEST");
//     console.log("Model:", model);
//     console.log("Context:", 2048);
//     console.log("Max tokens:", maxTokens);
//     console.log("=================================");

//     try {
//       const res = await fetch(url, {
//         method: "POST",

//         headers: {
//           "Content-Type": "application/json",
//         },

//         body: JSON.stringify(body),
//       });

//       if (!res.ok) {
//         const errorText = await res.text();

//         throw new Error(`Ollama chat HTTP ${res.status}: ${errorText}`);
//       }

//       const data = await res.json();

//       return {
//         text: data.message?.content || "",

//         model: data.model || model,

//         usage: {
//           input: data.prompt_eval_count || 0,

//           output: data.eval_count || 0,
//         },

//         durationMs: Date.now() - start,
//       };
//     } catch (err) {
//       log.warn(`Ollama chat error (${err.message})`);

//       throw err;
//     }
//   },

//   // ==========================================================
//   // EMBEDDINGS
//   // ==========================================================

//   async embed(input) {
//     const isArray = Array.isArray(input);

//     const texts = isArray ? input : [input];

//     // IMPORTANT:
//     // This is NOT the chat model.
//     // This model creates vectors for RAG.
//     const model = Config.models.ollamaEmbed || "nomic-embed-text:latest";

//     const url = `${Config.models.ollamaUrl}/api/embeddings`;

//     const vectors = [];

//     for (const text of texts) {
//       const res = await fetch(url, {
//         method: "POST",

//         headers: {
//           "Content-Type": "application/json",
//         },

//         body: JSON.stringify({
//           model,
//           prompt: text,
//         }),
//       });

//       if (!res.ok) {
//         const errorText = await res.text();

//         throw new Error(`Ollama embeddings HTTP ${res.status}: ${errorText}`);
//       }

//       const data = await res.json();

//       if (!Array.isArray(data.embedding)) {
//         throw new Error("Ollama did not return an embedding vector");
//       }

//       vectors.push(data.embedding);
//     }

//     return isArray ? vectors : vectors[0];
//   },
// };
