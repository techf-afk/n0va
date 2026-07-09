import { spawnSync, execSync } from 'child_process';
import { join } from 'path';
import os from 'os';

// Isolation primitives. Priority: Docker (if CONTAINERIZED=docker and daemon up)
// → hardened unshare+setpriv (no Docker) → plain (last resort).

export function dockerAvailable() {
  try {
    const { status } = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 });
    return status === 0;
  } catch {
    return false;
  }
}

export function unshareAvailable() {
  try {
    const { status } = spawnSync('unshare', ['-U', '-n', 'true'], { stdio: 'ignore', timeout: 5000 });
    return status === 0;
  } catch {
    return false;
  }
}

// Hardened unshare: user+network namespaces, drop all caps, no-new-privs,
// resource limits, run as non-root (when launched as root).
function unshareWrap(cmd, { network = false, cpu = 300, memBytes = 2 * 1024 * 1024 * 1024 } = {}) {
  const ns = network ? '-U' : '-U -n';
  const memMb = Math.floor(memBytes / (1024 * 1024));
  const dropUser = process.getuid && process.getuid() === 0 ? 'runuser -u nobody -- ' : '';
  // setpriv drops caps + blocks priv escalation; runuser drops to nobody.
  return `unshare ${ns} setpriv --nnp --inh-caps -all ` +
    `prlimit --cpu=${cpu} --as=${memBytes} ` +
    `${dropUser}sh -c ${JSON.stringify(cmd)}`;
}

// Docker: each scanner in an isolated, non-root, read-only, cap-drop container.
// Host-installed scanners (gitleaks/semgrep/nmap/...) are mounted read-only
// rather than baked into an image, so no per-tool image builds are needed.
function dockerWrap(cmd, { network = false, image = 'alpine:3.20', cpu = 300, memMb = 2048 } = {}) {
  const netFlag = network ? '--network=bridge' : '--network=none';
  const reposDir = process.env.TOOL_REPOS_DIR || join(os.homedir(), '.tool-orchestrator', 'repos');
  // Mount host binary dirs + cloned repos read-only. Rootfs is read-only;
  // only /tmp is writable (noexec) for scratch. Scanners read from /repos.
  const mounts = [
    `-v /usr/bin:/usr/bin:ro`,
    `-v /usr/local/bin:/usr/local/bin:ro`,
    `-v ${reposDir}:/repos:ro`,
  ].join(' ');
  return `docker run --rm ${netFlag} --cap-drop=ALL --security-opt=no-new-privileges ` +
    `--read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m ` +
    `-m ${memMb}m --cpus=1 --user nobody ` +
    `${mounts} ` +
    `${image} sh -c ${JSON.stringify(cmd)}`;
}

export function sandbox(cmd, options = {}) {
  const mode = process.env.CONTAINERIZED || 'unshare';
  if (mode === 'docker') {
    if (dockerAvailable()) return dockerWrap(cmd, options);
    console.warn('[sandbox] CONTAINERIZED=docker requested but Docker unavailable — falling back to unshare');
  }
  if (unshareAvailable()) {
    return unshareWrap(cmd, options);
  }
  return cmd;
}

export function isSandboxAvailable() {
  const mode = process.env.CONTAINERIZED || 'unshare';
  if (mode === 'docker') return dockerAvailable();
  return unshareAvailable();
}
