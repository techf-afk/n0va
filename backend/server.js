import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { AIClient } from './lib/ai-client.js';
import { ToolRegistry } from './registry/db.js';
import { ToolScanner, KNOWN_TOOLS, riskLevel, riskWarning } from './lib/scanner.js';
import { Orchestrator } from './lib/orchestrator.js';
import { TargetAnalyzer } from './lib/target-analyzer.js';
import { join } from 'path';
import os from 'os';
import { toSarif } from './lib/sarif.js';
import { proxyStatus } from './lib/proxy.js';
import { sandbox } from './lib/container.js';
import { redactText } from './lib/redact.js';
import { suggestFromTarget } from './lib/poc.js';

const DATA_DIR = join(os.homedir(), '.tool-orchestrator');
const LOCKFILE_PATH = join(DATA_DIR, 'PROTECTED');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

const app = express();
const PORT = process.env.PORT || 3001;
const REPOS_DIR = process.env.TOOL_REPOS_DIR || join(DATA_DIR, 'repos');

if (!existsSync(REPOS_DIR)) {
  mkdirSync(REPOS_DIR, { recursive: true });
}

// Create default safety config if missing
if (!existsSync(CONFIG_PATH)) {
  try {
    mkdirSync(join(os.homedir(), '.tool-orchestrator'), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ protectData: true, autoBackup: true, maxBackups: 10 }, null, 2));
  } catch {}
}

// Immutable mode check
const IMMUTABLE = existsSync(LOCKFILE_PATH);

app.use(cors());
app.use(express.json());

const aiClient = new AIClient();
const registry = new ToolRegistry();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (IMMUTABLE && ['DELETE', 'PATCH', 'PUT'].includes(req.method)) {
    return res.status(423).json({
      error: 'Database is locked (PROTECTED file exists). Remove ~/.tool-orchestrator/PROTECTED to enable writes.',
      hint: 'Run: rm ~/.tool-orchestrator/PROTECTED'
    });
  }
  next();
});

app.get('/api/config', (req, res) => {
  res.json({ reposDir: REPOS_DIR, immutable: IMMUTABLE });
});

app.get('/api/safety/egress', (req, res) => {
  res.json(proxyStatus());
});

app.get('/api/code', (req, res) => {
  const { path: filePath, line, context } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path required' });

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const startLine = Math.max(0, (parseInt(line) || 1) - 3);
    const endLine = Math.min(lines.length, startLine + 6);
    const snippet = lines.slice(startLine, endLine);

    res.json({
      lines: snippet.join('\n'),
      startLine: startLine + 1,
      endLine,
      totalLines: lines.length,
    });
  } catch (e) {
    res.json({ lines: null, error: 'Could not read file' });
  }
});

app.get('/api/tools', (req, res) => {
  const { type } = req.query;
  const tools = type ? registry.getToolsByType(type) : registry.getAllTools();
  res.json({ tools });
});

// Pre-flight: which scanner binaries are actually installed on this host
app.get('/api/tools/status', (req, res) => {
  const installed = {};
  for (const name of Object.keys(KNOWN_TOOLS || {})) {
    try {
      execSync(`which ${name}`, { encoding: 'utf-8', stdio: 'pipe' });
      installed[name] = true;
    } catch {
      installed[name] = false;
    }
  }
  res.json({ installed, total: Object.keys(installed).length, available: Object.values(installed).filter(Boolean).length });
});

// Risk level + warning per tool (drives operator-safety UI prompts)
app.get('/api/tools/risk', (req, res) => {
  const risks = {};
  const warnings = {};
  for (const name of Object.keys(KNOWN_TOOLS || {})) {
    const lvl = riskLevel(name);
    risks[name] = lvl;
    if (lvl !== 'passive') warnings[name] = riskWarning(lvl);
  }
  res.json({ risks, warnings });
});

app.get('/api/tools/deleted', (req, res) => {
  const tools = registry.listDeletedTools();
  res.json({ tools });
});

app.post('/api/tools/:id/restore', (req, res) => {
  registry.restoreTool(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/safety/status', (req, res) => {
  const config = registry.getSafetyConfig();
  res.json({ config, dbPath: registry.dbPath });
});

app.post('/api/safety/backup', (req, res) => {
  try {
    registry.backup();
    res.json({ success: true, message: 'Manual backup created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tools/:id', (req, res) => {
  const tool = registry.getTool(parseInt(req.params.id));
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  res.json({ tool });
});

app.post('/api/tools/scan', async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl required' });
  const result = await scanner.scanGitHubRepo(repoUrl);
  res.status(result.success ? 200 : 500).json(result);
});

app.post('/api/tools/manual', (req, res) => {
  const { name, type, description, repoUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const tool = {
    name,
    type: type || 'cli',
    description: description || '',
    repoUrl: repoUrl || '',
    interface: { type: 'cli', details: 'Command-line tool' },
    capabilities: [],
    inputs: [],
    outputs: [],
    metadata: {},
  };

  const result = registry.addTool(tool);
  res.json({ success: true, toolId: result.lastInsertRowid, tool });
});

app.delete('/api/tools/:id', (req, res) => {
  registry.deleteTool(parseInt(req.params.id));
  res.json({ success: true });
});

const targetAnalyzer = new TargetAnalyzer();

app.post('/api/analyze', async (req, res) => {
  const { target, useGobuster, useNuclei } = req.body;
  if (!target) return res.status(400).json({ error: 'target required' });
  const started = new Date().toISOString();
  const scanners = ['web+recon'];
  if (useGobuster) scanners.push('gobuster');
  if (useNuclei) scanners.push('nuclei');
  registry.logAudit({ action: 'analyze', target, scanner: scanners.join('+'), user: 'local', started_at: started, sandbox: process.env.CONTAINERIZED || 'unshare' });
  const result = await targetAnalyzer.fullAnalyze(target, { useGobuster: !!useGobuster, useNuclei: !!useNuclei });
  registry.logAudit({ action: 'analyze', target, scanner: scanners.join('+'), user: 'local', started_at: started, ended_at: new Date().toISOString(), exit_code: 0, sandbox: process.env.CONTAINERIZED || 'unshare' });
  res.json({ result });
});

// PoC command suggestions for a finished Analyze result.
app.post('/api/poc', (req, res) => {
  const { target } = req.body;
  if (!target) return res.status(400).json({ error: 'target required' });
  try {
    const suggestions = suggestFromTarget(target);
    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Interactive console — run a user-supplied command in the sandbox.
// Inherits egress proxy env; output is redacted + audit-logged.
app.post('/api/console/run', async (req, res) => {
  const { cmd } = req.body;
  if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd required' });
  if (cmd.length > 4000) return res.status(400).json({ error: 'cmd too long (max 4000)' });

  const started = new Date().toISOString();
  registry.logAudit({ action: 'console', target: cmd.slice(0, 200), scanner: 'manual', user: 'local', started_at: started, sandbox: process.env.CONTAINERIZED || 'unshare' });

  const wrapped = sandbox(cmd, { network: true });
  const proc = spawn('sh', ['-c', wrapped], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });

  let stdout = '', stderr = '';
  const timer = setTimeout(() => { proc.kill('SIGTERM'); }, 240000);
  proc.stdout.on('data', d => stdout += d.toString());
  proc.stderr.on('data', d => stderr += d.toString());
  proc.on('close', (code) => {
    clearTimeout(timer);
    registry.logAudit({ action: 'console', target: cmd.slice(0, 200), scanner: 'manual', user: 'local', started_at: started, ended_at: new Date().toISOString(), exit_code: code ?? -1, sandbox: process.env.CONTAINERIZED || 'unshare' });
    res.json({ stdout: redactText(stdout), stderr: redactText(stderr), exitCode: code ?? -1 });
  });
  proc.on('error', (e) => {
    clearTimeout(timer);
    res.status(500).json({ error: e.message });
  });
});

app.get('/api/pipelines', (req, res) => {
  const pipelines = orchestrator.pipelineEngine.listPipelines();
  res.json({ pipelines });
});

app.get('/api/pipelines/:name', (req, res) => {
  const pipeline = orchestrator.pipelineEngine.loadPipeline(req.params.name);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
  res.json({ pipeline });
});

app.post('/api/execute', async (req, res) => {
  const { request, pipeline: pipelineName } = req.body;
  if (!request) return res.status(400).json({ error: 'request required' });
  const result = await orchestrator.execute(request, pipelineName);
  res.json(result);
});

// ── Store routes ─────────────────────────────────────────────

app.get('/api/store/folders', (req, res) => {
  const folders = registry.getAllFolders();
  const withTools = folders.map(f => {
    const members = registry.getFolderMembers(f.id);
    return { ...f, members };
  });
  res.json({ folders: withTools });
});

app.post('/api/store/folders', (req, res) => {
  const { name, description, scanType } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = registry.createFolder(name, description, scanType);
    res.json({ success: true, folderId: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/store/folders/:id/members', (req, res) => {
  const { toolId } = req.body;
  if (!toolId) return res.status(400).json({ error: 'toolId required' });
  try {
    registry.addFolderMember(parseInt(req.params.id), toolId);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/store/folders/:folderId/members/:toolId', (req, res) => {
  try {
    registry.removeFolderMember(parseInt(req.params.folderId), parseInt(req.params.toolId));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/store/folders/:id/toggle', (req, res) => {
  try {
    const f = registry.toggleFolder(parseInt(req.params.id));
    if (!f) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, isActive: f.is_active ? 0 : 1 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/store/execute', async (req, res) => {
  const { folderId, target } = req.body;
  if (!folderId || !target) return res.status(400).json({ error: 'folderId and target required' });
  try {
    const result = await orchestrator.executeFolder(folderId, target);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/store/usage', (req, res) => {
  try {
    const usage = orchestrator.cloneStore.getUsage();
    res.json({ usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/store/pull', async (req, res) => {
  try {
    const folders = registry.getAllFolders();
    let cloned = 0;
    for (const f of folders) {
      const members = registry.getFolderMembers(f.id);
      for (const m of members) {
        if (m.tool_repo) {
          try {
            await orchestrator.cloneStore.ensureToolClone(f.name, m.tool_name, m.tool_repo);
            cloned++;
          } catch {}
        }
      }
    }
    res.json({ success: true, cloned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/executions', (req, res) => {
  const executions = registry.getRecentExecutions(20);
  res.json({ executions });
});

app.get('/api/audit', (req, res) => {
  const rows = registry.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all();
  res.json({ audit: rows });
});

app.get('/api/executions/:id', (req, res) => {
  const execution = registry.getExecution(parseInt(req.params.id));
  if (!execution) return res.status(404).json({ error: 'Execution not found' });
  res.json({ execution });
});

app.get('/api/executions/:id/steps', (req, res) => {
  const steps = registry.getExecutionSteps(parseInt(req.params.id));
  res.json({ steps });
});

app.get('/api/executions/:id/sarif', (req, res) => {
  const execution = registry.getExecution(parseInt(req.params.id));
  if (!execution) return res.status(404).json({ error: 'Execution not found' });

  const findings = [];
  let results;
  try {
    results = typeof execution.result === 'string' ? JSON.parse(execution.result) : execution.result;
  } catch {
    return res.status(500).json({ error: 'Failed to parse execution result' });
  }

  const steps = Array.isArray(results) ? results : (results.results || []);
  // Prefer report-merger details (aggregated, with baseline flags)
  const reportStep = steps.find(s => s && s.details);
  if (reportStep) {
    for (const toolFindings of Object.values(reportStep.details)) {
      findings.push(...toolFindings);
    }
  } else {
    for (const step of steps) {
      if (step && step.findings) findings.push(...step.findings);
    }
  }

  const sarif = toSarif(findings, execution);
  res.json(sarif);
});

app.get('/api/safety', (req, res) => {
  res.json({
    rules: {
      neverDeleteDatabase: true,
      autoBackupOnStartup: true,
      softDeleteEnabled: true,
      maxBackups: registry.config?.maxBackups || 10,
      recycleBin: true,
    }
  });
});

app.get('/api/stats', (req, res) => {
  const tools = registry.getAllTools();
  res.json({
    total: tools.length,
    byType: {
      api: tools.filter(t => t.type === 'api').length,
      cli: tools.filter(t => t.type === 'cli').length,
      library: tools.filter(t => t.type === 'library').length,
      service: tools.filter(t => t.type === 'service').length,
      other: tools.filter(t => t.type === 'other').length,
    }
  });
});

const server = app.listen(PORT, () => {
  const hasToken = !!process.env.GITHUB_TOKEN;
  const px = proxyStatus();
  console.log(`\n Tool Orchestrator Backend`);
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Repos:  ${REPOS_DIR}`);
  console.log(`   GitHub API: ${hasToken ? 'authenticated (5,000 req/hr)' : 'unauthenticated (60 req/hr) — set GITHUB_TOKEN for more'}`);
  console.log(`   Egress: ${px.configured ? 'proxy ' + px.proxy : 'REAL IP (no proxy set)'}`);
  console.log(`   9router: http://127.0.0.1:20128\n`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', (message) => {
    console.log('WS received:', message.toString());
  });
  ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
});

const scanner = new ToolScanner(aiClient, registry, { reposDir: REPOS_DIR });
const orchestrator = new Orchestrator(aiClient, registry, {
  ws: wss,
  reposDir: REPOS_DIR,
  containerized: process.env.CONTAINERIZED === 'true',
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing gracefully');
  registry.close();
  server.close();
});
