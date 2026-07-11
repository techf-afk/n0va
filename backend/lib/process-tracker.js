// Tracks in-flight scanner child processes so the server can kill them on shutdown.
export const activeChildren = new Set();

export function track(proc) {
  activeChildren.add(proc);
  const cleanup = () => activeChildren.delete(proc);
  proc.on('close', cleanup);
  proc.on('exit', cleanup);
  proc.on('error', cleanup);
  return proc;
}

export function killAllChildren(signal = 'SIGTERM') {
  for (const proc of activeChildren) {
    try { proc.kill(signal); } catch { /* already gone */ }
  }
  activeChildren.clear();
}
