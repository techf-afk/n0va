import { BaseAdapter } from './base.js';

export class SemgrepAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('semgrep') || action.includes('static') || action.includes('analysis') ||
      action.includes('vulnerability') || toolName === 'semgrep' || step.resolvedTool === 'semgrep';
  }

  async execute(step, context) {
    const repoPath = await this.ensureRepo(step, context);
    if (!repoPath) throw new Error('No repo path for semgrep scan');

    await this.ensureTool('semgrep');

    this.broadcast('step:progress', { step: 'semgrep', message: 'Running static analysis with semgrep...' });

    return this.safeExecute(step, context, async () => {
      const { stdout } = await this.runSandboxed('semgrep', `semgrep --config auto --json "${repoPath}"`, { timeout: 180000, network: false });

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = { results: [], errors: [] };
      }

      this.broadcast('step:progress', { step: 'semgrep', message: `Found ${parsed.results?.length || 0} issues` });

      return {
        tool: 'semgrep',
        findings: this.normalizeFindings(parsed.results || [], 'semgrep'),
        errors: parsed.errors || [],
        summary: { total: parsed.results?.length || 0 },
      };
    });
  }
}
