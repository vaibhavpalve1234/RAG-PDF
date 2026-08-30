// ============================================================
// services/rag/vector-math.js — pure math, no I/O.
// If a similarity score looks wrong, this is the only file
// that can be at fault.
// ============================================================

export function cosineSimilarity(a, b) {
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

export function matchesFilter(metadata = {}, filter = null) {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}

export function hashCode(value) {
  let h = 2166136261;

  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h;
}