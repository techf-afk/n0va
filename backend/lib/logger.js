// Tiny leveled logger — no deps. Respects N0VA_VERBOSE=1 or --verbose flag.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold =
  process.env.N0VA_VERBOSE === '1' || process.argv.includes('--verbose') ? 3 : 2;

function emit(level, args) {
  if (LEVELS[level] > threshold) return;
  const ts = new Date().toISOString().slice(11, 19);
  const tag = { error: 'ERR', warn: 'WRN', info: 'INF', debug: 'DBG' }[level];
  const line = `[${ts}] ${tag} ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  error: (...a) => emit('error', a),
  warn: (...a) => emit('warn', a),
  info: (...a) => emit('info', a),
  debug: (...a) => emit('debug', a),
};
