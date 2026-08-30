// ============================================================
// services/rag/delete.js — remove documents/collections.
// If something you deleted is still showing up in search
// results, this is the only file to look at.
// ============================================================

import { readStore, writeStore, queueStoreWrite } from "./store.js";

export async function deleteDocuments(options = {}) {
  const { collection, documentId } = options;

  return queueStoreWrite(async () => {
    const store = await readStore();

    let removed = 0;
    let collectionsCleared = [];

    if (!collection && !documentId) {
      collectionsCleared = Object.keys(store.collections);
      removed = collectionsCleared.reduce(
        (sum, name) => sum + (store.collections[name]?.documents.length || 0),
        0,
      );
      store.collections = {};
    } else if (collection && !documentId) {
      if (store.collections[collection]) {
        removed = store.collections[collection].documents.length;
        delete store.collections[collection];
        collectionsCleared = [collection];
      }
    } else {
      const targets = collection ? [collection] : Object.keys(store.collections);

      for (const name of targets) {
        const bucket = store.collections[name];
        if (!bucket) continue;

        const before = bucket.documents.length;
        bucket.documents = bucket.documents.filter((doc) => doc.metadata.documentId !== documentId);
        removed += before - bucket.documents.length;
      }
    }

    store.updatedAt = new Date().toISOString();
    await writeStore(store);

    return {
      removed,
      collectionsCleared,
      collection: collection || null,
      documentId: documentId || null,
    };
  });
}