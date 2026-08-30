// ============================================================
// services/rag/ingest.js — file -> pages -> chunks -> vectors -> store.
// If an upload fails or produces wrong chunk counts, this is
// the only file to look at.
// ============================================================

import { readFile } from "fs/promises";
import path from "path";
import { extractPages } from "../utils/extractor.js";
import { uuid, now } from "../shared/utils.js";
import { log } from "../shared/logger.js";
import { chunkText } from "./chunker.js";
import { createVector } from "./embeddings.js";
import { readStore, writeStore, queueStoreWrite } from "./store.js";
import {
  DEFAULT_COLLECTION,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_PAGE_BATCH_SIZE,
  DEFAULT_BATCH_CONCURRENCY,
} from "./constants.js";

export async function ingestFile(input, options = {}) {
  const buffer = await loadFileBuffer(input);
  const fileName = resolveFileName(input);
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

// Prefer an explicit fileName/name; if the caller only gave a `path`
// (e.g. { path: "C:/.../Resume.pdf" }), derive the name — and therefore
// the extension the extractor dispatches on — from that path instead
// of falling through to the generic "uploaded.file" default.
function resolveFileName(input = {}) {
  if (input.fileName) return input.fileName;
  if (input.name) return input.name;
  if (input.path) return path.basename(input.path);
  return "uploaded.file";
}

async function loadFileBuffer(input = {}) {
  if (input.buffer) return Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer);
  if (input.base64) return Buffer.from(input.base64, "base64");
  if (input.dataUrl) return Buffer.from(String(input.dataUrl).split(",").pop(), "base64");
  if (input.path) return readFile(input.path);

  throw new Error("File input requires one of: path, base64, dataUrl, or buffer");
}

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