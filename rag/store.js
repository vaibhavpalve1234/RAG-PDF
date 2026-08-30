// ============================================================
// services/rag/store.js — JSON-backed vector store.
// All persistent state (the cache + the write queue) lives ONLY
// here. Every other module talks to the store through these
// three functions — never touch the file directly elsewhere.
// ============================================================

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
// services/rag/store.js -> ../data == project-root/data
const DATA_DIR = path.join(__dir, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "rag-store.json");

let storeCache = null;
let writeQueue = Promise.resolve();

export async function readStore() {
  if (storeCache) return storeCache;

  try {
    storeCache = JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    storeCache = { version: 1, collections: {}, updatedAt: null };
  }

  return storeCache;
}

export async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  storeCache = store;
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

/** Serializes writes so a delete and an in-flight ingest can't race. */
export async function queueStoreWrite(operation) {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}