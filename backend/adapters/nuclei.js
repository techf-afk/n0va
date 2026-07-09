import { BaseAdapter } from './base.js';

export class NucleiAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('nuclei') || action.includes('vulnerability scan') ||
      action.includes('cve') || toolName === 'nuclei' || step.resolvedTool === 'nuclei';
  }

  async execute(step, context) {
    const target = step.inputs?.target || step.inputs?.url || context.target || context.repoUrl;
    if (!target) throw new Error('No target for nuclei scan. Provide a URL.');

    await this.ensureTool('nuclei');

    this.broadcast('step:progress', { step: 'nuclei', message: `Scanning ${target} with nuclei (3000+ templates)...` });

    return this.safeExecute(step, context, async () => {
      const { stdout } = await this.runSandboxed('nuclei', `nuclei -u "${target}" -jsonl -severity low,medium,high,critical -silent`, { timeout: 300000, network: true });

      const findings = stdout.trim().split('\n').filter(l => l).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);

      const bySeverity = {};
      for (const f of findings) {
        const s = f.info?.severity || f.severity || 'unknown';
        if (!bySeverity[s]) bySeverity[s] = 0;
        bySeverity[s]++;
      }

      this.broadcast('step:progress', {
        step: 'nuclei',
        message: `Found ${findings.length} issues — ${
          Object.entries(bySeverity).map(([s, c]) => `${c} ${s}`).join(', ')
        }`,
      });

      return {
        tool: 'nuclei',
        findings: this.normalizeFindings(findings, 'nuclei'),
        summary: { total: findings.length, bySeverity },
      };
    });
  }
}
