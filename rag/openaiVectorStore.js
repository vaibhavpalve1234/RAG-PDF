// ============================================================
// services/rag/openaiVectorStore.js — Optional OpenAI-hosted
// vector store backend. This does NOT train/save data inside
// model weights; it stores files in OpenAI vector stores and
// uses file_search at answer time.
// ============================================================

import OpenAI, { toFile } from "openai";
import { readFile } from "fs/promises";
import path from "path";
import { Config } from "../config/index.js";

let client;

function getClient() {
  client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function isOpenAIVectorStoreMode(options = {}) {
  return (options.storageProvider || Config.rag.storageProvider) === "openai";
}

export function resolveVectorStoreId(options = {}) {
  const vectorStoreId = options.vectorStoreId || process.env.OPENAI_VECTOR_STORE_ID;

  if (!vectorStoreId) {
    throw new Error(
      "OPENAI_VECTOR_STORE_ID is required when RAG_STORE_PROVIDER=openai. Create a vector store in OpenAI first, then set this env var.",
    );
  }

  return vectorStoreId;
}

export async function uploadToOpenAIVectorStore(input, options = {}) {
  const vectorStoreId = resolveVectorStoreId(options);
  const fileName = resolveFileName(input);
  const file = await toFile(await loadFileBuffer(input), fileName);

  const result = await getClient().vectorStores.files.uploadAndPoll(vectorStoreId, file);

  return {
    storageProvider: "openai",
    vectorStoreId,
    fileId: result.id,
    status: result.status,
    fileName,
  };
}

export async function askOpenAIVectorStore(question, options = {}) {
  if (!question?.trim()) throw new Error("question is required");

  const vectorStoreId = resolveVectorStoreId(options);
  const model = options.model || Config.models.openai;

  const response = await getClient().responses.create({
    model,
    input: buildQuestion(question),
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      },
    ],
    temperature: options.temperature ?? Config.models.temperature,
    max_output_tokens: options.maxTokens || Config.models.maxTokens,
  });

  return {
    answer: response.output_text || extractResponseText(response),
    sources: [],
    model: response.model || model,
    storageProvider: "openai",
    vectorStoreId,
    usage: {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0,
    },
  };
}

function buildQuestion(question) {
  return [
    "Answer using only the uploaded files available through file_search.",
    "If the answer is not present in the uploaded files, say: I do not know from the uploaded documents.",
    "Question:",
    question,
  ].join("\n");
}

function extractResponseText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof Uint8Array) return Buffer.from(buffer);
  return Buffer.from(buffer || "");
}

function resolveFileName(input = {}) {
  if (input.fileName) return input.fileName;
  if (input.name) return input.name;
  if (input.path) return path.basename(input.path);
  return "uploaded.file";
}

async function loadFileBuffer(input = {}) {
  if (input.buffer) return normalizeBuffer(input.buffer);
  if (input.base64) return Buffer.from(input.base64, "base64");
  if (input.dataUrl) return Buffer.from(String(input.dataUrl).split(",").pop(), "base64");
  if (input.path) return readFile(input.path);

  throw new Error("File input requires one of: path, base64, dataUrl, or buffer");
}
