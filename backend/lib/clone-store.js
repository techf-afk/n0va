import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

const STORE_DIR = join(homedir(), '.tool-orchestrator', 'store');
const TARGETS_DIR = join(homedir(), '.tool-orchestrator', 'repos');
const MAX_BYTES = 100 * 1024 * 1024 * 1024; // 100GB
const META_FILE = '.store-meta.json';

function getSize(dir) {
  try {
    let total = 0;
    const walk = (p) => {
      for (const name of readdirSync(p)) {
        const fp = join(p, name);
        try {
          const s = statSync(fp);
          if (s.isDirectory()) walk(fp);
          else total += s.size;
        } catch {}
      }
    };
    walk(dir);
    return total;
  } catch {
    return 0;
  }
}

function getAccessTime(dir) {
  try {
    const entries = readdirSync(dir);
    let latest = 0;
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      try {
        const mtime = statSync(join(dir, e)).atimeMs;
        if (mtime > latest) latest = mtime;
      } catch {}
    }
    return latest || Date.now();
  } catch {
    return 0;
  }
}

function loadMeta() {
  try {
    return JSON.parse(readFileSync(join(STORE_DIR, META_FILE), 'utf-8'));
  } catch {
    return { toolClones: {}, lastEvicted: null };
  }
}

function saveMeta(meta) {
  try {
    writeFileSync(join(STORE_DIR, META_FILE), JSON.stringify(meta, null, 2));
  } catch {}
}

export class CloneStore {
  constructor() {
    this.storeDir = STORE_DIR;
    this.targetsDir = TARGETS_DIR;
    this.maxBytes = MAX_BYTES;
    if (!existsSync(this.storeDir)) mkdirSync(this.storeDir, { recursive: true });
    if (!existsSync(this.targetsDir)) mkdirSync(this.targetsDir, { recursive: true });
    this.meta = loadMeta();
  }

  getTargetsDir() {
    return this.targetsDir;
  }

  getStoreDir() {
    return this.storeDir;
  }

  toolClonePath(folderName, toolName) {
    return join(this.storeDir, folderName, toolName);
  }

  async ensureToolClone(folderName, toolName, repoUrl) {
    const dest = this.toolClonePath(folderName, toolName);
    if (existsSync(dest)) {
      // Touch .store-meta to mark recent
      this.meta.toolClones[`${folderName}/${toolName}`] = Date.now();
      saveMeta(this.meta);
      return dest;
    }
    mkdirSync(join(this.storeDir, folderName), { recursive: true });
    await this.evictIfNeeded();
    await this.gitClone(repoUrl, dest);
    this.meta.toolClones[`${folderName}/${toolName}`] = Date.now();
    saveMeta(this.meta);
    return dest;
  }

  async ensureTargetClone(repoUrl) {
    const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = clean.split('/');
    const repoName = parts[parts.length - 1] || `repo-${Date.now()}`;
    const dest = join(this.targetsDir, repoName);
    if (existsSync(dest)) return dest;
    await this.evictIfNeeded();
    await this.gitClone(repoUrl, dest);
    return dest;
  }

  async gitClone(repoUrl, dest) {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['clone', '--depth', '1', repoUrl, dest], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code !== 0) reject(new Error(`git clone failed: ${stderr}`));
        else resolve();
      });
      proc.on('error', reject);
    });
  }

  evictIfNeeded() {
    const currentSize = this.getCurrentSize();
    if (currentSize < this.maxBytes) return;
    const candidates = this.listClonesSorted();
    let freed = 0;
    for (const { path } of candidates) {
      if (freed >= currentSize - this.maxBytes * 0.9) break;
      try {
        const sz = statSync(path).size || 0;
        rmSync(path, { recursive: true, force: true });
        freed += sz;
      } catch {}
    }
    this.meta.lastEvicted = Date.now();
    saveMeta(this.meta);
    if (freed > 0) console.log(`Evicted ${(freed / 1024 / 1024).toFixed(1)} MB from clone cache`);
  }

  listClonesSorted() {
    const entries = [];
    for (const key of Object.keys(this.meta.toolClones)) {
      const p = join(this.storeDir, key);
      if (existsSync(p)) entries.push({ key, path: p, accessed: this.meta.toolClones[key] || 0 });
    }
    for (const name of readdirSync(this.targetsDir)) {
      const p = join(this.targetsDir, name);
      if (name.startsWith('.')) continue;
      try {
        if (statSync(p).isDirectory()) {
          entries.push({ key: `repo:${name}`, path: p, accessed: getAccessTime(p) });
        }
      } catch {}
    }
    return entries.sort((a, b) => a.accessed - b.accessed);
  }

  getCurrentSize() {
    let total = 0;
    const dirs = [this.storeDir, this.targetsDir];
    for (const d of dirs) {
      if (existsSync(d)) total += getSize(d);
    }
    return total;
  }

  getUsage() {
    const current = this.getCurrentSize();
    return {
      usedBytes: current,
      totalBytes: this.maxBytes,
      usedGB: (current / 1024 / 1024 / 1024).toFixed(2),
      totalGB: '100.00',
      percent: ((current / this.maxBytes) * 100).toFixed(1),
    };
  }

  deleteToolClone(folderName, toolName) {
    const dest = this.toolClonePath(folderName, toolName);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    delete this.meta.toolClones[`${folderName}/${toolName}`];
    saveMeta(this.meta);
  }
}
