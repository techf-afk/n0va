import Database from 'better-sqlite3';
import { readFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAFETY_CONFIG_PATH = join(os.homedir(), '.tool-orchestrator', 'config.json');

function loadSafetyConfig() {
  try {
    const data = readFileSync(SAFETY_CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { protectData: true, autoBackup: true, maxBackups: 10 };
  }
}

function getBackupDir() {
  const dir = join(__dirname, '..', 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function rotateBackups(maxBackups) {
  const dir = getBackupDir();
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.db.bak')).sort().reverse();
    if (files.length > maxBackups) {
      for (const f of files.slice(maxBackups)) {
        try { unlinkSync(join(dir, f)); } catch {}
      }
    }
  } catch {}
}

export class ToolRegistry {
  constructor(dbPath = join(__dirname, 'tools.db')) {
    this.dbPath = dbPath;
    this.config = loadSafetyConfig();

    if (this.config.autoBackup && existsSync(dbPath)) {
      this.backup();
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  backup() {
    try {
      const dir = getBackupDir();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const bakPath = join(dir, `tools-${ts}.db.bak`);
      copyFileSync(this.dbPath, bakPath);
      console.log(`Database backed up to ${bakPath}`);
      rotateBackups(this.config.maxBackups || 10);
    } catch (e) {
      console.error('Backup failed:', e.message);
    }
  }

  init() {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema);

    // Add recycle_bin table if missing (for future restores)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recycle_bin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Tamper-evident audit log. Each entry chains to the previous via HMAC,
  // so altering any past row breaks the chain.
  logAudit(entry) {
    try {
      const last = this.db.prepare('SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
      const prevHash = last?.entry_hash || 'GENESIS';
      const payload = JSON.stringify({
        ts: entry.ts || new Date().toISOString(),
        action: entry.action, target: entry.target, scanner: entry.scanner,
        command: entry.command, user: entry.user, started_at: entry.started_at,
        ended_at: entry.ended_at, exit_code: entry.exit_code, sandbox: entry.sandbox,
        prevHash,
      });
      const key = this.dbPath; // HMAC key derived from db identity (best-effort, local)
      const entryHash = createHmac('sha256', key).update(payload).digest('hex').slice(0, 32);
      this.db.prepare(`
        INSERT INTO audit_log (ts, action, target, scanner, command, user, started_at, ended_at, exit_code, sandbox, prev_hash, entry_hash)
        VALUES (@ts, @action, @target, @scanner, @command, @user, @started_at, @ended_at, @exit_code, @sandbox, @prevHash, @entryHash)
      `).run({
        ts: entry.ts || new Date().toISOString(),
        action: entry.action || 'scan', target: entry.target || null, scanner: entry.scanner || null,
        command: entry.command || null, user: entry.user || 'local', started_at: entry.started_at || null,
        ended_at: entry.ended_at || null, exit_code: entry.exit_code ?? null, sandbox: entry.sandbox || 'none',
        prevHash, entryHash,
      });
    } catch (e) {
      console.error('Audit log failed:', e.message);
    }
  }

  addTool(tool) {
    const stmt = this.db.prepare(`
      INSERT INTO tools (name, type, description, repo_url, interface_type,
                        interface_details, capabilities, inputs, outputs, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      tool.name, tool.type, tool.description, tool.repoUrl,
      tool.interface?.type, tool.interface?.details,
      JSON.stringify(tool.capabilities || []),
      JSON.stringify(tool.inputs || []),
      JSON.stringify(tool.outputs || []),
      JSON.stringify(tool.metadata || {})
    );
  }

  getTool(id) {
    const tool = this.db.prepare('SELECT * FROM tools WHERE id = ?').get(id);
    return tool ? this.deserializeTool(tool) : null;
  }

  getToolByName(name) {
    const tool = this.db.prepare('SELECT * FROM tools WHERE name = ? AND status = ?').get(name, 'active');
    return tool ? this.deserializeTool(tool) : null;
  }

  getAllTools() {
    return this.db.prepare('SELECT * FROM tools WHERE status = ?').all('active').map(t => this.deserializeTool(t));
  }

  getToolsByType(type) {
    return this.db.prepare('SELECT * FROM tools WHERE type = ? AND status = ?').all(type, 'active').map(t => this.deserializeTool(t));
  }

  updateTool(id, updates) {
    const fields = [];
    const values = [];
    Object.entries(updates).forEach(([key, value]) => {
      if (['capabilities', 'inputs', 'outputs', 'metadata'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    values.push(id);
    const stmt = this.db.prepare(`UPDATE tools SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    return stmt.run(...values);
  }

  deleteTool(id) {
    const tool = this.getTool(id);
    if (tool && this.config.protectData) {
      this.db.prepare('INSERT INTO recycle_bin (table_name, record_id, data) VALUES (?, ?, ?)').run('tools', id, JSON.stringify(tool));
    }
    return this.db.prepare('UPDATE tools SET status = ? WHERE id = ?').run('inactive', id);
  }

  listDeletedTools() {
    return this.db.prepare('SELECT * FROM tools WHERE status = ?').all('inactive').map(t => this.deserializeTool(t));
  }

  restoreTool(id) {
    return this.db.prepare('UPDATE tools SET status = ? WHERE id = ?').run('active', id);
  }

  createExecution(userRequest) {
    const stmt = this.db.prepare('INSERT INTO executions (user_request) VALUES (?)');
    return stmt.run(userRequest);
  }

  // result blobs are encrypted at rest (AES-256-GCM). Key derived from db path.
  _cipherKey() {
    return createHash('sha256').update(`n0va:${this.dbPath}`).digest();
  }

  encryptResult(plain) {
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this._cipherKey(), iv);
      const enc = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf-8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `n0va1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
    } catch {
      return typeof plain === 'string' ? plain : JSON.stringify(plain);
    }
  }

  decryptResult(stored) {
    if (typeof stored !== 'string' || !stored.startsWith('n0va1:')) return stored;
    try {
      const [, ivB64, tagB64, encB64] = stored.split(':');
      const decipher = createDecipheriv('aes-256-gcm', this._cipherKey(), Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
      return JSON.parse(dec.toString('utf-8'));
    } catch {
      return stored;
    }
  }

  updateExecution(id, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
    if (updates.result !== undefined) {
      const idx = Object.keys(updates).indexOf('result');
      values[idx] = this.encryptResult(updates.result);
    }
    values.push(id);
    return this.db.prepare(`UPDATE executions SET ${fields} WHERE id = ?`).run(...values);
  }

  getExecution(id) {
    const exec = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(id);
    if (exec?.plan) exec.plan = JSON.parse(exec.plan);
    if (exec?.result) exec.result = this.decryptResult(exec.result);
    return exec;
  }

  getLatestExecutionForRepo(repoUrl) {
    if (!repoUrl) return null;
    const pattern = `%${repoUrl}%`;
    const row = this.db.prepare(`
      SELECT * FROM executions
      WHERE user_request LIKE ? AND status = 'completed' AND result IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(pattern);
    if (!row) return null;
    if (row.result) row.result = this.decryptResult(row.result);
    return row;
  }

  getRecentExecutions(limit = 20) {
    return this.db.prepare('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?').all(limit).map(e => {
      if (e.plan) e.plan = JSON.parse(e.plan);
      if (e.result) e.result = this.decryptResult(e.result);
      return e;
    });
  }

  getExecutionSteps(executionId) {
    return this.db.prepare(
      'SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_number ASC'
    ).all(executionId).map(s => {
      if (s.inputs) s.inputs = JSON.parse(s.inputs);
      if (s.outputs) s.outputs = JSON.parse(s.outputs);
      return s;
    });
  }

  getCachedRepo(owner, repo) {
    const row = this.db.prepare('SELECT * FROM repo_cache WHERE repo_key = ?').get(`${owner}/${repo}`);
    if (!row) return null;
    const age = (Date.now() - new Date(row.cached_at + 'Z').getTime()) / 3600000;
    if (age > 1) {
      this.db.prepare('DELETE FROM repo_cache WHERE repo_key = ?').run(`${owner}/${repo}`);
      return null;
    }
    return JSON.parse(row.data);
  }

  setCachedRepo(owner, repo, data) {
    this.db.prepare(
      'INSERT OR REPLACE INTO repo_cache (repo_key, data, cached_at) VALUES (?, ?, ?)'
    ).run(`${owner}/${repo}`, JSON.stringify(data), new Date().toISOString());
  }

  getSafetyConfig() {
    return { ...this.config };
  }

  deserializeTool(tool) {
    return {
      ...tool,
      capabilities: JSON.parse(tool.capabilities || '[]'),
      inputs: JSON.parse(tool.inputs || '[]'),
      outputs: JSON.parse(tool.outputs || '[]'),
      metadata: JSON.parse(tool.metadata || '{}'),
    };
  }

  // ── Store: Tool Folders ──────────────────────────────────────

  createFolder(name, description, scanType) {
    const stmt = this.db.prepare(
      'INSERT INTO tool_folders (name, description, scan_type) VALUES (?, ?, ?)'
    );
    return stmt.run(name, description || '', scanType || 'repo');
  }

  getFolder(id) {
    return this.db.prepare('SELECT * FROM tool_folders WHERE id = ?').get(id);
  }

  getAllFolders() {
    return this.db.prepare('SELECT * FROM tool_folders ORDER BY created_at DESC').all();
  }

  updateFolder(id, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    return this.db.prepare(`UPDATE tool_folders SET ${fields} WHERE id = ?`).run(...values);
  }

  toggleFolder(id) {
    const f = this.getFolder(id);
    if (!f) return null;
    return this.db.prepare('UPDATE tool_folders SET is_active = ? WHERE id = ?').run(f.is_active ? 0 : 1, id);
  }

  getFolderMembers(folderId) {
    const rows = this.db.prepare(`
      SELECT m.*, t.name as tool_name, t.type as tool_type, t.repo_url as tool_repo
      FROM tool_folder_members m
      JOIN tools t ON t.id = m.tool_id
      WHERE m.folder_id = ?
      ORDER BY m.order_index ASC
    `).all(folderId);
    return rows;
  }

  addFolderMember(folderId, toolId, orderIndex) {
    const max = this.db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM tool_folder_members WHERE folder_id = ?').get(folderId);
    const idx = orderIndex !== undefined ? orderIndex : max.next;
    return this.db.prepare(
      'INSERT OR IGNORE INTO tool_folder_members (folder_id, tool_id, order_index) VALUES (?, ?, ?)'
    ).run(folderId, toolId, idx);
  }

  removeFolderMember(folderId, toolId) {
    return this.db.prepare(
      'DELETE FROM tool_folder_members WHERE folder_id = ? AND tool_id = ?'
    ).run(folderId, toolId);
  }

  getFolderWithTools(folderId) {
    const folder = this.getFolder(folderId);
    if (!folder) return null;
    const members = this.getFolderMembers(folderId);
    return { ...folder, members };
  }

  getActiveFoldersWithTools() {
    const folders = this.db.prepare('SELECT * FROM tool_folders WHERE is_active = 1 ORDER BY created_at DESC').all();
    return folders.map(f => {
      const members = this.getFolderMembers(f.id);
      return { ...f, members };
    });
  }

  seedDefaultFolders() {
    const existing = this.db.prepare('SELECT COUNT(*) as cnt FROM tool_folders').get();
    if (existing.cnt > 0) return;

    const folders = [
      { name: 'Secrets Detection', desc: 'Scan for leaked secrets and credentials', tools: ['gitleaks', 'trufflehog'], type: 'repo' },
      { name: 'SAST', desc: 'Static code analysis for vulnerabilities', tools: ['semgrep'], type: 'repo' },
      { name: 'Web Audit', desc: 'Web application security audit', tools: ['nuclei', 'nmap', 'nikto'], type: 'web' },
      { name: 'Full Suite', desc: 'All available tools combined', tools: ['gitleaks', 'trufflehog', 'semgrep', 'nuclei', 'nmap', 'nikto'], type: 'repo' },
    ];

    for (const f of folders) {
      const res = this.db.prepare(
        'INSERT INTO tool_folders (name, description, scan_type) VALUES (?, ?, ?)'
      ).run(f.name, f.desc, f.type);
      const folderId = res.lastInsertRowid;
      f.tools.forEach((toolName, i) => {
        const tool = this.getToolByName(toolName);
        if (tool) {
          this.db.prepare(
            'INSERT INTO tool_folder_members (folder_id, tool_id, order_index) VALUES (?, ?, ?)'
          ).run(folderId, tool.id, i);
        }
      });
    }

    console.log('Seeded default tool folders');
  }

  close() {
    this.db.close();
  }
}
