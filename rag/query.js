// ============================================================
// services/rag/query.js — similarity search + LLM answer.
// If a query returns wrong sources or a bad answer, this is
// the only file to look at.
// ============================================================

import { getModel } from "../models/index.js";
import { Config } from "../config/index.js";
import { readStore } from "./store.js";
import { createVector } from "./embeddings.js";
import { cosineSimilarity, matchesFilter } from "./vector-math.js";
import { DEFAULT_COLLECTION } from "./constants.js";

export async function similaritySearch(query, options = {}) {
  const store = await readStore();
  const collection = options.collection || DEFAULT_COLLECTION;
  const docs = store.collections[collection]?.documents || [];

  if (!docs.length) return [];

  const qVec = await createVector(query, options);

  return docs
    .filter((doc) => matchesFilter(doc.metadata, options.filter))
    .map((doc) => ({ ...doc, score: cosineSimilarity(qVec, doc.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(options.topK || 6));
}

export async function askRag(question, options = {}) {
  if (!question?.trim()) throw new Error("question is required");

  const collection = options.collection || DEFAULT_COLLECTION;
  const topK = Number(options.topK || 3);
  const modelName = options.model || Config.models.default;

  console.log("🔎 Searching for:", question, "| model:", modelName);

  const matches = await similaritySearch(question, {
    collection,
    topK,
    filter: options.filter,
    embeddingProvider: options.embeddingProvider,
  });

  console.log(`📄 Found ${matches.length} matching chunks`);

  if (!matches.length) {
    return {
      answer: "I do not know from the uploaded documents.",
      sources: [],
      model: modelName,
      usage: { input: 0, output: 0 },
    };
  }

  const context = matches
    .map(
      (match, index) =>
        `SOURCE ${index + 1}\nFile: ${match.metadata.fileName}\nPage: ${match.metadata.pageNumber}\nScore: ${match.score.toFixed(3)}\n\n${match.text}`,
    )
    .join("\n\n");

  const prompt = `CONTEXT: ${context} QUESTION: ${question} ANSWER: `.trim();

  const model = await getModel(modelName);
  const completion = await model.complete(prompt, {
    // system: "You are a document question-answering assistant.",
    temperature: options.temperature ?? Config.models.temperature,
    maxTokens: options.maxTokens || Config.models.maxTokens,
  });

  return {
    answer: completion.text,
    // sources: matches.map(toSource),
    // model: completion.model || modelName,
    // usage: completion.usage,
  };
}

function toSource(match) {
  return { id: match.id, score: match.score, text: match.text, metadata: match.metadata };
}