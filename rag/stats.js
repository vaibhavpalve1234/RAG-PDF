// ============================================================
// services/rag/stats.js
// ============================================================

import { readStore } from "./store.js";

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