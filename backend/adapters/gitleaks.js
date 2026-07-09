import { BaseAdapter } from './base.js';

export class GitleaksAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('gitleaks') || action.includes('secret') || action.includes('leak') ||
      toolName === 'gitleaks' || step.resolvedTool === 'gitleaks';
  }

  async execute(step, context) {
    const repoPath = await this.ensureRepo(step, context);
    if (!repoPath) throw new Error('No repo path for gitleaks scan');

    await this.ensureTool('gitleaks');

    this.broadcast('step:progress', { step: 'gitleaks', message: 'Scanning for secrets with gitleaks...' });

    return this.safeExecute(step, context, async () => {
      const { stdout } = await this.runSandboxed('gitleaks', `gitleaks detect --source "${repoPath}" --report-format json --no-git --verbose`, { timeout: 120000, network: false });

      let findings = [];
      try {
        findings = JSON.parse(stdout);
        if (!Array.isArray(findings)) findings = [];
      } catch {
        findings = [];
      }

      this.broadcast('step:progress', { step: 'gitleaks', message: `Found ${findings.length} potential secrets` });

      return {
        tool: 'gitleaks',
        findings: this.normalizeFindings(findings, 'gitleaks'),
        summary: { total: findings.length, severity: 'high' },
      };
    });
  }
}
