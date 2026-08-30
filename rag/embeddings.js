// ============================================================
// services/rag/embeddings.js — text -> vector.
// Tries the configured embedding provider first; falls back to
// a deterministic (non-semantic) hash embedding so ingestion
// never hard-fails when no embedding model is configured.
// ============================================================

import { getModel } from "../models/index.js";
import { Config } from "../config/index.js";
import { log } from "../shared/logger.js";
import { hashCode } from "./vector-math.js";
import { DEFAULT_VECTOR_DIMENSIONS } from "./constants.js";

export async function createVector(text, options = {}) {
  const embeddingProvider = options.embeddingProvider || Config.models.embeddingsProvider || null;

  if (embeddingProvider) {
    try {
      const model = await getModel(embeddingProvider);
      const vector = await model.embed(text);

      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error("Embedding model returned an empty vector");
      }

      return vector;
    } catch (err) {
      log.warn(`Embedding provider "${embeddingProvider}" failed: ${err.message}`);
      log.warn("Falling back to hashing embeddings.");
    }
  }

  return hashEmbedding(text, options.dimensions || DEFAULT_VECTOR_DIMENSIONS);
}

function hashEmbedding(text, dimensions) {
  const vector = Array(dimensions).fill(0);

  const tokens = String(text || "").toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];

  for (const token of tokens) {
    const index = Math.abs(hashCode(token)) % dimensions;
    vector[index] += 1 / Math.sqrt(token.length || 1);
  }

  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}