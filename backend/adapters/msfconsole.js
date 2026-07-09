import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BaseAdapter } from './base.js';

const SCANNER_MODULES = [
  'auxiliary/scanner/http/options',
  'auxiliary/scanner/http/http_version',
  'auxiliary/scanner/http/robots_txt',
  'auxiliary/scanner/http/title',
  'auxiliary/scanner/http/webdav_scanner',
  'auxiliary/scanner/http/frontpage_login',
];

export class MsfconsoleAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('msf') || action.includes('metasploit') ||
      action.includes('exploit') || action.includes('auxiliary') ||
      toolName === 'msfconsole' || step.resolvedTool === 'msfconsole';
  }

  async execute(step, context) {
    const target = step.inputs?.target || step.inputs?.host || step.inputs?.ip || context.target || context.repoUrl;
    if (!target) throw new Error('No target for msfconsole scan. Provide an IP or hostname.');

    await this.ensureTool('msfconsole');

    return this.safeExecute(step, context, async () => {
      const host = target.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
      const port = target.match(/:(\d+)/)?.[1] || (target.startsWith('https') ? '443' : '80');
      const workDir = join(tmpdir(), `msf-${Date.now()}`);
      mkdirSync(workDir, { recursive: true });
      const rcFile = join(workDir, 'scan.rc');
      const outputFile = join(workDir, 'output.json');

      const rcLines = SCANNER_MODULES.map(mod => [
        `use ${mod}`,
        `set RHOSTS ${host}`,
        `set RPORT ${port}`,
        `set SSL ${port === '443'}`,
        'run',
      ]).flat();
      rcLines.push('exit');
      writeFileSync(rcFile, rcLines.join('\n'));

      let stdout = '';
      try {
        const result = await this.runSandboxed('msfconsole',
          `msfconsole -q -r "${rcFile}" -oJ "${outputFile}"`,
          { timeout: 600000, network: true }
        );
        stdout = result.stdout;
      } catch (e) {
        const stderr = e.message || '';
        stdout = stderr;
      }

      let findings = [];
      try {
        const { readFileSync } = await import('fs');
        if (existsSync(outputFile)) {
          const raw = readFileSync(outputFile, 'utf-8');
          const lines = raw.trim().split('\n').filter(l => l.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.host || entry.vuln || entry.name) {
                findings.push({
                  host: entry.host || host,
                  port: entry.port || port,
                  module: entry.module || entry.name || '',
                  message: entry.info || entry.description || entry.name || '',
                  severity: entry.severity || (entry.info ? 'medium' : 'info'),
                });
              }
            } catch {}
          }
        }
      } catch {}

      try {
        unlinkSync(rcFile);
        unlinkSync(outputFile);
        unlinkSync(workDir);
      } catch {}

      this.broadcast('step:progress', {
        step: 'msfconsole',
        message: `Metasploit found ${findings.length} items`,
      });

      const normalized = findings.map(f => ({
        file: `${f.host}:${f.port}`,
        line: 0,
        message: f.message,
        severity: f.severity || 'info',
        cwe: '',
        tool: 'msfconsole',
        raw: f,
      }));

      return {
        tool: 'msfconsole',
        findings: this.normalizeFindings(normalized, 'msfconsole'),
        summary: { total: findings.length },
      };
    });
  }
}
