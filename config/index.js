// ============================================================
//  config/index.js — Central Configuration
// ============================================================
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load `.env` deterministically relative to the repo root, not process.cwd().
// Do not override already-set environment variables (dotenv default behavior).
const __dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dir, '..', '.env') });

export const Config = {
  // Models
  models: {
    default:        process.env.DEFAULT_MODEL     || 'openai',
    // Provider used for embeddings stored in vector DB (defaults to OpenAI).
    embeddingsProvider: process.env.EMBEDDINGS_PROVIDER || 'openai',
    openai:         process.env.OPENAI_MODEL      || 'gpt-4o',
    openaiEmbed:    process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    claude:         process.env.CLAUDE_MODEL      || 'claude-sonnet-4-6',
    ollama:         process.env.OLLAMA_MODEL,
    ollamaEmbed:    process.env.OLLAMA_EMBED_MODEL || '',
    ollamaUrl:      process.env.OLLAMA_URL        || 'http://localhost:11434',
    huggingfaceUrl: process.env.HF_INFERENCE_URL  || 'https://api-inference.huggingface.co',
    maxTokens:      parseInt(process.env.MAX_TOKENS) || 2000,
    temperature:    parseFloat(process.env.TEMPERATURE) || 0.2,
  },

  // Memory
  memory: {
    chromaUrl:    process.env.CHROMA_URL        || 'http://localhost:8000',
    cacheHit:     parseFloat(process.env.CACHE_HIT  || '0.85'),
    cacheSoft:    parseFloat(process.env.CACHE_SOFT || '0.72'),
    cacheAgeDays: parseInt(process.env.CACHE_AGE_DAYS || '30'),
    maxHistory:   parseInt(process.env.MAX_HISTORY   || '500'),
  },

  // RAG storage
  rag: {
    // "json" stores embeddings in data/rag-store.json.
    // "openai" uploads files to OPENAI_VECTOR_STORE_ID and answers with file_search.
    storageProvider: process.env.RAG_STORE_PROVIDER || 'json',
  },

  // Queue
  queue: {
    concurrency:  parseInt(process.env.QUEUE_CONCURRENCY || '5'),
    maxRetries:   parseInt(process.env.MAX_RETRIES       || '3'),
    timeoutMs:    parseInt(process.env.TASK_TIMEOUT_MS   || '60000'),
    pollInterval: parseInt(process.env.QUEUE_POLL_MS     || '500'),
  },

  // API
  api: {
    port:      parseInt(process.env.PORT       || '3000'),
    host:      process.env.HOST               || '0.0.0.0',
    wsEnabled: process.env.WS_ENABLED         !== 'false',
    corsOrigin: process.env.CORS_ORIGIN       || '*',
  },

  // Tools
  tools: {
    tavilyKey:    process.env.TAVILY_API_KEY   || '',
    execTimeoutMs: parseInt(process.env.EXEC_TIMEOUT_MS || '5000'),
    maxOutputBytes: parseInt(process.env.MAX_OUTPUT_BYTES || '4096'),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
