// ============================================================
//  shared/logger.js — Structured Logger
// ============================================================
import chalk from 'chalk';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const level  = () => LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

const icons = {
  debug:     chalk.gray('◌'),
  info:      chalk.blue('●'),
  warn:      chalk.yellow('▲'),
  error:     chalk.red('✕'),
  success:   chalk.green('✔'),
  kernel:    chalk.magenta('⬡'),
  agent:     chalk.cyan('◈'),
  tool:      chalk.yellow('⚙'),
  memory:    chalk.blue('◎'),
  queue:     chalk.green('⊞'),
  model:     chalk.magenta('◆'),
  api:       chalk.cyan('⇄'),
};

const ts = () => chalk.gray(new Date().toISOString().slice(11, 23));

function fmt(icon, color, msg, meta) {
  const m = meta !== undefined
    ? ' ' + chalk.gray(typeof meta === 'object' ? JSON.stringify(meta) : String(meta))
    : '';
  return `${ts()} ${icon} ${chalk[color](msg)}${m}`;
}

export const log = {
  debug:   (msg, meta) => level() <= 0 && console.log(fmt(icons.debug,   'gray',    msg, meta)),
  info:    (msg, meta) => level() <= 1 && console.log(fmt(icons.info,    'white',   msg, meta)),
  warn:    (msg, meta) => level() <= 2 && console.log(fmt(icons.warn,    'yellow',  msg, meta)),
  error:   (msg, meta) => level() <= 3 && console.log(fmt(icons.error,   'red',     msg, meta)),
  success: (msg, meta) => console.log(fmt(icons.success, 'green',  msg, meta)),
  kernel:  (msg, meta) => level() <= 1 && console.log(fmt(icons.kernel,  'magenta', `[KERNEL] ${msg}`, meta)),
  agent:   (name, msg) => level() <= 1 && console.log(fmt(icons.agent,   'cyan',    `[${name}] ${msg}`)),
  tool:    (name, msg) => level() <= 1 && console.log(fmt(icons.tool,    'yellow',  `[TOOL:${name}] ${msg}`)),
  memory:  (msg, meta) => level() <= 1 && console.log(fmt(icons.memory,  'blue',    `[MEM] ${msg}`, meta)),
  queue:   (msg, meta) => level() <= 1 && console.log(fmt(icons.queue,   'green',   `[QUEUE] ${msg}`, meta)),
  model:   (name, msg) => level() <= 1 && console.log(fmt(icons.model,   'magenta', `[${name}] ${msg}`)),
  api:     (msg, meta) => level() <= 1 && console.log(fmt(icons.api,     'cyan',    `[API] ${msg}`, meta)),
};