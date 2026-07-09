import { BaseAdapter } from './base.js';

export class NiktoAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('nikto') || action.includes('web scan') || action.includes('http scan') ||
      toolName === 'nikto' || step.resolvedTool === 'nikto';
  }

  async execute(step, context) {
    const target = step.inputs?.target || step.inputs?.url || context.target || context.repoUrl;
    if (!target) throw new Error('No target for nikto scan. Provide a URL.');

    await this.ensureTool('nikto');

    return this.safeExecute(step, context, async () => {
      const outputFile = `/tmp/nikto-output-${Date.now()}.json`;

      let stdout, stderr;
      try {
        const result = await this.runSandboxed('nikto',
          `nikto -h "${target}" -Format json -o "${outputFile}"`,
          { timeout: 300000, network: true }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (e) {
        stdout = '';
        stderr = e.message || '';
      }

      let findings = [];
      try {
        const { readFileSync, existsSync } = await import('fs');
        if (existsSync(outputFile)) {
          const raw = JSON.parse(readFileSync(outputFile, 'utf-8'));
          const entries = Array.isArray(raw) ? raw : [raw];
          for (const entry of entries) {
            const vulns = entry.vulnerabilities || [];
            for (const v of vulns) {
              findings.push({
                file: `${entry.host || target}${v.url || ''}`,
                line: 0,
                message: v.msg || '',
                severity: 'medium',
                cwe: '',
                tool: 'nikto',
                raw: v,
              });
            }
          }
        }
      } catch {
        findings = [];
      }

      try {
        const { unlinkSync } = await import('fs');
        unlinkSync(outputFile);
      } catch {}

      this.broadcast('step:progress', {
        step: 'nikto',
        message: `Nikto found ${findings.length} issues`,
      });

      return {
        tool: 'nikto',
        findings: this.normalizeFindings(findings, 'nikto'),
        summary: { total: findings.length },
      };
    });
  }
}
