import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { sandbox, isSandboxAvailable } from '../lib/container.js';
import { redactFindings } from '../lib/redact.js';
import { track } from '../lib/process-tracker.js';

export class BaseAdapter {
  constructor(config = {}) {
    this.reposDir = config.reposDir || process.env.TOOL_REPOS_DIR || join(os.homedir(), '.tool-orchestrator', 'repos');
    this.binDir = config.binDir || process.env.TOOL_BIN_DIR || join(os.homedir(), '.local', 'bin');
    this.ws = config.ws || null;
    this.containerized = config.containerized ?? (process.env.CONTAINERIZED === 'true');
    this._sandboxAvailable = null;

    this.toolInfo = {
      gitleaks: {
        name: 'gitleaks',
        install: 'https://github.com/gitleaks/gitleaks/releases',
        package: 'brew install gitleaks or download from GitHub',
      },
      trufflehog: {
        name: 'trufflehog',
        install: 'https://github.com/trufflesecurity/trufflehog/releases',
        package: 'brew install trufflehog or download from GitHub',
      },
      semgrep: {
        name: 'semgrep',
        install: 'https://semgrep.dev/docs/getting-started/',
        package: 'pip install semgrep or brew install semgrep',
      },
      nuclei: {
        name: 'nuclei',
        install: 'https://github.com/projectdiscovery/nuclei/releases',
        package: 'brew install nuclei or download from GitHub',
      },
      nmap: {
        name: 'nmap',
        install: 'https://nmap.org/download.html',
        package: 'apt install nmap or brew install nmap',
      },
      nikto: {
        name: 'nikto',
        install: 'https://github.com/sullo/nikto',
        package: 'apt install nikto or download from GitHub',
      },
      msfconsole: {
        name: 'msfconsole',
        install: 'https://docs.metasploit.com/docs/using-metasploit/getting-started/nightly-installers.html',
        package: 'curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall && chmod 755 msfinstall && ./msfinstall',
      },
    };
  }

  canHandle(step) {
    return false;
  }

  async execute(step, context) {
    throw new Error(`Adapter ${this.constructor.name} cannot execute step: ${step.action}`);
  }

  async ensureRepo(step, context) {
    let repoPath = context.repoPath || step.inputs?.repoPath || step.inputs?.repository;

    if (!repoPath) {
      const repoUrl = step.inputs?.repoUrl || step.inputs?.repository || step.inputs?.url || context.repoUrl;
      if (!repoUrl) return null;

      if (!existsSync(this.reposDir)) {
        mkdirSync(this.reposDir, { recursive: true });
      }

      const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
      const parts = clean.split('/');
      const repoName = parts[parts.length - 1] || `repo-${Date.now()}`;
      repoPath = join(this.reposDir, repoName);

      if (!existsSync(repoPath)) {
        const stepName = this.constructor.name.replace('Adapter', '').toLowerCase();
        this.broadcast('step:progress', {
          step: stepName,
          message: `Cloning ${repoUrl}...`,
        });

        const { exitCode, stderr } = await this.runAsync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, { timeout: 120000 });
        if (exitCode !== 0) throw new Error(`git clone failed: ${stderr}`);

        this.broadcast('step:progress', {
          step: stepName,
          message: `Cloned to ${repoPath}`,
        });
      }
    }

    return repoPath;
  }

  async checkTool(toolName) {
    try {
      const { exitCode } = await this.runAsync(`which ${toolName}`, { timeout: 5000 });
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async ensureTool(toolName) {
    const info = this.toolInfo[toolName];
    if (!(await this.checkTool(toolName))) {
      throw new Error(
        `Tool not found: ${toolName}\n` +
        `  Install: ${info?.install || 'check official documentation'}\n` +
        `  Package: ${info?.package || 'install via package manager'}`
      );
    }
    return true;
  }

  async safeExecute(step, context, executeFn) {
    try {
      const startTime = Date.now();
      const result = await executeFn(step, context);

      return {
        ...result,
        status: 'success',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const toolName = this.constructor.name.replace('Adapter', '').toLowerCase();
      this.broadcast('step:error', {
        step: toolName,
        error: error.message,
      });

      return {
        tool: toolName,
        status: 'error',
        error: error.message,
        findings: [],
        summary: { total: 0 },
      };
    }
  }

  broadcast(type, data) {
    if (this.ws) {
      this.ws.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type, ...data, timestamp: new Date().toISOString() }));
        }
      });
    }
  }

  runAsync(cmd, options = {}) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, PATH: `${this.binDir}:${process.env.PATH}` };
      const proc = track(spawn(cmd, { env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] }));

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      const timer = options.timeout
        ? setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Command timed out after ${options.timeout}ms: ${cmd}`));
          }, options.timeout)
        : null;

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });

      proc.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
    });
  }

  async checkSandbox() {
    if (this._sandboxAvailable === null) {
      this._sandboxAvailable = this.containerized && isSandboxAvailable();
    }
    return this._sandboxAvailable;
  }

  async runSandboxed(toolName, cmd, options = {}) {
    const useSandbox = await this.checkSandbox();
    if (useSandbox) {
      const wrapped = sandbox(cmd, { network: options.network ?? false });
      return this.runAsync(wrapped, options);
    }
    return this.runAsync(cmd, options);
  }

  normalizeFindings(rawFindings, toolName) {
    return redactFindings(rawFindings).map(f => ({
      file: f.file || f.path || f.File || '',
      line: parseInt(f.line || f.Line || f.start?.line || 0, 10) || 0,
      message: f.message || f.extra?.message || f.Description || '',
      severity: this.mapSeverity(f.severity || f.Severity || f.extra?.severity),
      cwe: this.extractCWE(f),
      tool: toolName,
      raw: f.raw || f,
    }));
  }

  mapSeverity(sev) {
    const map = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
      info: 'info',
      error: 'high',
      warning: 'medium',
    };
    return map[String(sev).toLowerCase()] || 'info';
  }

  extractCWE(finding) {
    const cwes = finding.cwe || finding.CWE || finding.extra?.metadata?.cwe;
    if (Array.isArray(cwes)) return cwes[0] || '';
    if (typeof cwes === 'string') return cwes;
    return '';
  }
}
