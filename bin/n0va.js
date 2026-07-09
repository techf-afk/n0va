#!/usr/bin/env node
// n0va CLI — starts the orchestrator backend (which serves the built UI).
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BACKEND = join(ROOT, 'backend');

const proc = spawn(process.execPath, ['server.js'], {
  cwd: BACKEND,
  stdio: 'inherit',
  env: process.env,
});

proc.on('exit', (code) => process.exit(code ?? 0));

const shutdown = () => {
  proc.kill('SIGINT');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
