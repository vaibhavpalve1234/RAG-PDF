import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { getModel } from "../models/index.js";
import { extractPages, supportedExtensions } from "../utils/extractor.js";
import { Config } from "../config/index.js";
import { log } from "../shared/logger.js";
import { uuid, now } from "../shared/utils.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "rag-store.json");

const DEFAULT_COLLECTION = "rag_default";

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 180;

const DEFAULT_VECTOR_DIMENSIONS = 384;

const DEFAULT_PAGE_BATCH_SIZE = 6;
const DEFAULT_BATCH_CONCURRENCY = 1;

let storeCache = null;
let writeQueue = Promise.resolve();

// ============================================================
// CHUNK TEXT — file-type agnostic, unchanged
// ============================================================

export function chunkText(
  text,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();

  if (!clean) return [];

  if (chunkSize <= overlap) {
    throw new Error("chunkSize must be greater than overlap");
  }

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    const hardEnd = Math.min(start + chunkSize, clean.length);
    let end = hardEnd;

    if (hardEnd < clean.length) {
      const boundary = Math.max(
        clean.lastIndexOf(". ", hardEnd),
        clean.lastIndexOf("? ", hardEnd),
        clean.lastIndexOf("! ", hardEnd),
        clean.lastIndexOf(" ", hardEnd),
      );

      if (boundary > start + chunkSize * 0.6) end = boundary + 1;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

// ============================================================
// INGEST — any supported file type (pdf, docx, txt, md, csv, json, html)
// ============================================================

export async function ingestFile(input, options = {}) {
  const buffer = await loadFileBuffer(input);
  const fileName = input.fileName || input.name || "uploaded.file";
  const documentId = input.documentId || uuid();

  log.info?.(`Starting ingestion: ${fileName}`);

  const pages = await extractPages(buffer, fileName);

  console.log(`Extracted ${pages.length} page(s)/section(s) from ${fileName}`);

  if (!pages.length) {
    throw new Error(
      `No readable text found in "${fileName}". If this is a scanned/image PDF, run OCR before ingestion.`,
    );
  }

  const batches = batchArray(
    pages,
    Number(options.pageBatchSize || DEFAULT_PAGE_BATCH_SIZE),
  );

  const batchResults = await mapWithConcurrency(
    batches,
    Number(options.batchConcurrency || DEFAULT_BATCH_CONCURRENCY),
    (pageBatch, batchIndex) =>
      ingestPageBatch(pageBatch, {
        ...options,
        batchIndex,
        documentId,
        fileName,
        collection: options.collection || DEFAULT_COLLECTION,
      }),
  );

  const chunks = batchResults.reduce((sum, r) => sum + r.chunks, 0);

  return {
    documentId,
    fileName,
    collection: options.collection || DEFAULT_COLLECTION,
    pages: pages.length,
    batches: batchResults.length,
    chunks,
    batchResults,
  };
}

// Backward-compatible alias for old callers
export const ingestPdf = ingestFile;
export { supportedExtensions };

// ============================================================
// ASK RAG — model is resolved through the registry, not hardcoded
// ============================================================

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

  const prompt = `
Answer the question using ONLY the context below.

Rules:
- Do not use outside knowledge.
- Do not invent information.
- If the answer is not present in the context, say:
  "I do not know from the uploaded documents."
- Keep the answer short and direct.
- Mention the source file/page when possible.

CONTEXT:
${context}

QUESTION:
${question}

ANSWER:
`.trim();

  const model = await getModel(modelName);

  const completion = await model.complete(prompt, {
    system: "You are a document question-answering assistant.",
    temperature: options.temperature ?? Config.models.temperature,
    maxTokens: options.maxTokens || Config.models.maxTokens,
  });

  return {
    answer: completion.text,
    sources: matches.map(toSource),
    model: completion.model || modelName,
    usage: completion.usage,
  };
}

// ============================================================
// SIMILARITY SEARCH
// ============================================================

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

// ============================================================
// DELETE DOCUMENTS
// - no args              -> wipes every collection
// - { collection }       -> wipes one collection
// - { documentId }       -> removes that document's chunks (all collections,
//                           or just `collection` if also given)
// ============================================================

export async function deleteDocuments(options = {}) {
  const { collection, documentId } = options;

  return queueStoreWrite(async () => {
    const store = await readStore();

    let removed = 0;
    let collectionsCleared = [];

    if (!collection && !documentId) {
      // wipe everything
      collectionsCleared = Object.keys(store.collections);
      removed = collectionsCleared.reduce(
        (sum, name) => sum + (store.collections[name]?.documents.length || 0),
        0,
      );
      store.collections = {};
    } else if (collection && !documentId) {
      // wipe one collection
      if (store.collections[collection]) {
        removed = store.collections[collection].documents.length;
        delete store.collections[collection];
        collectionsCleared = [collection];
      }
    } else {
      // remove one document's chunks, from one collection or all of them
      const targets = collection ? [collection] : Object.keys(store.collections);

      for (const name of targets) {
        const bucket = store.collections[name];
        if (!bucket) continue;

        const before = bucket.documents.length;
        bucket.documents = bucket.documents.filter(
          (doc) => doc.metadata.documentId !== documentId,
        );
        removed += before - bucket.documents.length;
      }
    }

    store.updatedAt = new Date().toISOString();
    await writeStore(store);

    return { removed, collectionsCleared, collection: collection || null, documentId: documentId || null };
  });
}

// ============================================================
// ROUTER
// ============================================================

export async function createRagRouter() {
  const express = await import("express").then((m) => m.default);
  // npm i multer  — real multipart file uploads from a browser/Postman
  const multer = await import("multer").then((m) => m.default);
  const upload = multer({ storage: multer.memoryStorage() });

  const router = express.Router();

  // ----------------------------------------------------------
  // Upload ANY supported file type — multipart/form-data, field "file"
  // ----------------------------------------------------------
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file uploaded (field name: 'file')" });
      }

      const result = await ingestFile(
        {
          buffer: req.file.buffer,
          fileName: req.file.originalname,
          documentId: req.body?.documentId,
        },
        { ...req.body, collection: req.body?.collection },
      );

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Deprecated alias — JSON body with base64/path/buffer/dataUrl (old PDF-only route)
  router.post("/upload-pdf", async (req, res) => {
    try {
      const result = await ingestFile(req.body, req.body?.options || {});
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post("/ask", async (req, res) => {
    try {
      const result = await askRag(req.body.question, req.body);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ----------------------------------------------------------
  // Delete — DELETE /delete                (wipes everything)
  //          DELETE /delete?collection=x   (wipes one collection)
  //          DELETE /delete?documentId=y   (removes one document)
  // Query params or JSON body both work.
  // ----------------------------------------------------------
  router.delete("/delete", async (req, res) => {
    try {
      const collection = req.query.collection || req.body?.collection;
      const documentId = req.query.documentId || req.body?.documentId;

      const result = await deleteDocuments({ collection, documentId });

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.get("/documents", async (_req, res) => {
    try {
      const stats = await getRagStats();
      res.json({ ok: true, ...stats });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/supported-types", (_req, res) => {
    res.json({ ok: true, extensions: supportedExtensions() });
  });

  return router;
}

// ============================================================
// INGEST PAGE BATCH
// ============================================================

async function ingestPageBatch(pages, options) {
  const docs = [];

  for (const page of pages) {
    const chunks = chunkText(
      page.text,
      options.chunkSize || DEFAULT_CHUNK_SIZE,
      options.chunkOverlap || DEFAULT_CHUNK_OVERLAP,
    );

    chunks.forEach((text, chunkIndex) => {
      docs.push({
        id: `${options.documentId}_p${page.pageNumber}_c${chunkIndex}`,
        text,
        metadata: {
          documentId: options.documentId,
          fileName: options.fileName,
          pageNumber: page.pageNumber,
          chunkIndex,
          batchIndex: options.batchIndex,
          createdAt: now(),
        },
      });
    });
  }

  await addVectorDocuments(options.collection, docs, options);

  return {
    batchIndex: options.batchIndex,
    pages: pages.map((p) => p.pageNumber),
    chunks: docs.length,
  };
}

// ============================================================
// ADD VECTOR DOCUMENTS
// ============================================================

async function addVectorDocuments(collection, docs, options = {}) {
  if (!docs.length) return;

  const vectorDocs = [];

  for (const doc of docs) {
    const vector = await createVector(doc.text, options);
    vectorDocs.push({ ...doc, vector });
  }

  await queueStoreWrite(async () => {
    const store = await readStore();

    store.collections[collection] ||= { documents: [] };
    store.collections[collection].documents.push(...vectorDocs);
    store.updatedAt = new Date().toISOString();

    await writeStore(store);
  });
}

// ============================================================
// CREATE EMBEDDING (any provider, hash fallback if none configured)
// ============================================================

async function createVector(text, options = {}) {
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

// ============================================================
// HASH EMBEDDING FALLBACK — NOT semantic, test/offline use only
// ============================================================

function hashEmbedding(text, dimensions) {
  const vector = Array(dimensions).fill(0);

  const tokens =
    String(text || "")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]+/gu) || [];

  for (const token of tokens) {
    const index = Math.abs(hashCode(token)) % dimensions;
    vector[index] += 1 / Math.sqrt(token.length || 1);
  }

  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

// ============================================================
// FILE BUFFER LOADING
// ============================================================

async function loadFileBuffer(input = {}) {
  if (input.buffer) return Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer);
  if (input.base64) return Buffer.from(input.base64, "base64");
  if (input.dataUrl) return Buffer.from(String(input.dataUrl).split(",").pop(), "base64");
  if (input.path) return readFile(input.path);

  throw new Error("File input requires one of: path, base64, dataUrl, or buffer");
}

// ============================================================
// STORE
// ============================================================

async function readStore() {
  if (storeCache) return storeCache;

  try {
    storeCache = JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    storeCache = { version: 1, collections: {}, updatedAt: null };
  }

  return storeCache;
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  storeCache = store;
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function queueStoreWrite(operation) {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

// ============================================================
// STATS
// ============================================================

export async function getRagStats() {
  const store = await readStore();

  const collections = Object.fromEntries(
    Object.entries(store.collections).map(([name, value]) => [
      name,
      {
        documents: value.documents.length,
        sourceDocuments: new Set(value.documents.map((d) => d.metadata.documentId)).size,
      },
    ]),
  );

  return { collections };
}

// ============================================================
// HELPERS
// ============================================================

function batchArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = Array(items.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;

  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function matchesFilter(metadata = {}, filter = null) {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}

function hashCode(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

function toSource(match) {
  return { id: match.id, score: match.score, text: match.text, metadata: match.metadata };
}