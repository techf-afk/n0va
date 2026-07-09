import { BaseAdapter } from './base.js';

export class TrufflehogAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('trufflehog') || action.includes('deep-secret') || action.includes('credential') ||
      toolName === 'trufflehog' || step.resolvedTool === 'trufflehog';
  }

  async execute(step, context) {
    const repoPath = await this.ensureRepo(step, context);
    if (!repoPath) throw new Error('No repo path for trufflehog scan');

    await this.ensureTool('trufflehog');

    this.broadcast('step:progress', { step: 'trufflehog', message: 'Scanning with trufflehog...' });

    return this.safeExecute(step, context, async () => {
      const { stdout } = await this.runSandboxed('trufflehog', `trufflehog filesystem --directory "${repoPath}" --json`, { timeout: 180000, network: false });

      const findings = stdout.trim().split('\n').filter(l => l).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);

      this.broadcast('step:progress', { step: 'trufflehog', message: `Found ${findings.length} items` });

      return {
        tool: 'trufflehog',
        findings: this.normalizeFindings(findings, 'trufflehog'),
        summary: { total: findings.length },
      };
    });
  }
}
