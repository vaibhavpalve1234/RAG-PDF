// ============================================================
// utils/extractor.js — Converts uploaded files into text pages.
// RAG ingestion calls extractPages(buffer, fileName), then chunks
// those pages and stores embeddings for /api/rag/ask.
// ============================================================

import path from "path";
import { PDFParse } from "pdf-parse";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm"]);
const SUPPORTED_EXTENSIONS = [".pdf", ...TEXT_EXTENSIONS].sort();

export function supportedExtensions() {
  return [...SUPPORTED_EXTENSIONS];
}

export async function extractPages(buffer, fileName = "uploaded.file") {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".pdf") return extractPdfPages(buffer);
  if (TEXT_EXTENSIONS.has(extension)) return extractTextPages(buffer);

  throw new Error(
    `Unsupported file type "${extension || "unknown"}". Supported types: ${SUPPORTED_EXTENSIONS.join(", ")}`,
  );
}

async function extractPdfPages(buffer) {
  const parser = new PDFParse({ data: normalizeBuffer(buffer) });

  try {
    const info = await parser.getInfo();
    const totalPages = Number(info.total || 0);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const result = await parser.getText({ partial: [pageNumber] });
      const text = cleanText(result.text);
      if (text) pages.push({ pageNumber, text });
    }

    if (pages.length) return pages;

    const fallback = await parser.getText();
    const text = cleanText(fallback.text);
    return text ? [{ pageNumber: 1, text }] : [];
  } finally {
    await parser.destroy();
  }
}

function extractTextPages(buffer) {
  const text = cleanText(normalizeBuffer(buffer).toString("utf8"));
  return text ? [{ pageNumber: 1, text }] : [];
}

function normalizeBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof Uint8Array) return Buffer.from(buffer);
  return Buffer.from(buffer || "");
}

function cleanText(text) {
  return String(text || "").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}
