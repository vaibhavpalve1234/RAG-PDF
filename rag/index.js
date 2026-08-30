// ============================================================
// services/rag/index.js — barrel file.
// Keeps `import { askRag } from "../services/rag-service.js"`
// style call sites working after the split (point them at
// "./rag/index.js" instead). New code should import directly
// from the specific module below — that way a bug points you
// straight to one file instead of a 500-line one.
// ============================================================

export { chunkText } from "./chunker.js";
export { ingestFile, ingestPdf } from "./ingest.js";
export { askRag, similaritySearch } from "./query.js";
export { deleteDocuments } from "./delete.js";
export { getRagStats } from "./stats.js";
export { createRagRouter } from "./router.js";
export { createVector } from "./embeddings.js";
export { cosineSimilarity, matchesFilter } from "./vector-math.js";
export { supportedExtensions } from "../utils/extractor.js";
export { DEFAULT_COLLECTION } from "./constants.js";