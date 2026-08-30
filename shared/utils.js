// ============================================================
//  shared/utils.js — Common Utilities
// ============================================================
import { v4 as uuidv4 } from 'uuid';

export const uuid = () => uuidv4();

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

export function truncate(str, max = 200) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max) + '…';
}

export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

export function safeJson(text) {
  try {
    return JSON.parse(text.replace(/```json\s*/gi, '').replace(/```/g, '').trim());
  } catch {
    return null;
  }
}

export function now() {
  return new Date().toISOString();
}

export function elapsed(startMs) {
  return `${Date.now() - startMs}ms`;
}