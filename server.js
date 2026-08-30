import express       from 'express';
import { createServer }    from 'http';
import chalk         from 'chalk';
import { log }       from './shared/logger.js';
import { bus, Events } from './shared/events.js';
import { createRagRouter } from './rag/index.js';
import { Config }    from './config/index.js';


// ─── App setup ────────────────────────────────────────────
const app    = express();
const server = createServer(app);

app.use(express.json({ limit: '50mb' }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  Config.api.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});


// Request logger
app.use((req, _res, next) => {
  log.api(`${req.method} ${req.path}`);
  next();
});

// ─── Helper ───────────────────────────────────────────────
const ok   = (res, data)   => res.json({ ok: true,  ...data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// ─── Routes ───────────────────────────────────────────────

// Health
app.get('/api/health', (_req, res) => ok(res, {
  status:    'healthy',
  version:   '1.0.0',
  timestamp: new Date().toISOString(),
  uptime:    process.uptime(),
}));

// ── PDF RAG ───────────────────────────────────────────────
// RAG API endpoint definitions live in api/server.js. The implementation
// stays inside rag/ragSystem.js so the RAG feature remains isolated.
app.use('/api/rag', await createRagRouter());


// ─── Boot ─────────────────────────────────────────────────
async function boot() {
  console.log(chalk.bold.cyan('\n  🤖 PDF RAG...\n'));
  console.log(Config)
  // . Start HTTP server
  server.listen(Config.api.port, Config.api.host, () => {
    console.log(chalk.bold.green(`\n  ✔ AI-OS running at       http://${Config.api.host}:${Config.api.port}`));
    console.log(chalk.bold.cyan( `  ✔ Dashboard at           http://localhost:${Config.api.port}`));
    console.log(chalk.gray(      `  ✔ WebSocket stream at    ws://${Config.api.host}:${Config.api.port}/ws`));
    console.log(chalk.cyan('\n  Endpoints:'));
    [
      'GET  /api/health        — Health check',
      'POST /api/rag/upload-pdf — Upload/index a PDF for RAG',
      'POST /api/rag/ask       — Ask uploaded PDFs',
      'GET  /api/rag/documents — RAG collection stats',
    ].forEach(e => console.log(chalk.gray(`    ${e}`)));
    console.log('');
    bus.emit(Events.SYSTEM_READY, { component: 'api', port: Config.api.port });
  });
}

boot().catch(err => {
  console.error(chalk.red('\nFatal boot error:'), err);
  process.exit(1);
});

export { app, server };
