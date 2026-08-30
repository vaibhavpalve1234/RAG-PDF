// ============================================================
// services/rag/chunker.js — plain-text chunking, zero external deps.
// Easiest file to unit test in isolation: chunkText(text) in,
// string[] out, no I/O, no mocks needed.
// ============================================================

import { DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from "./constants.js";

export function chunkText(
  text,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();

  if (!clean) return [];
  if (chunkSize <= overlap) throw new Error("chunkSize must be greater than overlap");

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