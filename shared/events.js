// ============================================================
//  shared/events.js — Global Event Bus
//  All modules emit/listen here for loose coupling
// ============================================================
import EventEmitter from 'eventemitter3';

export const bus = new EventEmitter();

// ─── Typed event helpers ───────────────────────────────────
export const Events = {
  // Kernel
  TASK_QUEUED:     'task:queued',
  TASK_STARTED:    'task:started',
  TASK_COMPLETED:  'task:completed',
  TASK_FAILED:     'task:failed',
  TASK_CANCELLED:  'task:cancelled',

  // Agents
  AGENT_SPAWNED:   'agent:spawned',
  AGENT_DONE:      'agent:done',
  AGENT_ERROR:     'agent:error',
  AGENT_LOG:       'agent:log',

  // Memory
  CACHE_HIT:       'memory:cache_hit',
  CACHE_MISS:      'memory:cache_miss',
  MEMORY_SAVED:    'memory:saved',

  // Models
  MODEL_REQUEST:   'model:request',
  MODEL_RESPONSE:  'model:response',
  MODEL_ERROR:     'model:error',

  // Tools
  TOOL_CALLED:     'tool:called',
  TOOL_RESULT:     'tool:result',
  TOOL_ERROR:      'tool:error',

  // System
  SYSTEM_READY:    'system:ready',
  SYSTEM_SHUTDOWN: 'system:shutdown',
};

/** Emit + return a promise that resolves on the reply event. */
export function request(emitEvent, replyEvent, payload, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${replyEvent}`)), timeoutMs);
    bus.once(replyEvent, (data) => { clearTimeout(timer); resolve(data); });
    bus.emit(emitEvent, payload);
  });
}