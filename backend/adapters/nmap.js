import { BaseAdapter } from './base.js';

export class NmapAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    const toolName = typeof step.tool === 'string' ? step.tool.toLowerCase() : '';
    return action.includes('nmap') || action.includes('network') || action.includes('scan') ||
      toolName === 'nmap' || step.resolvedTool === 'nmap';
  }

  async execute(step, context) {
    const target = step.inputs?.target || step.inputs?.host || step.inputs?.ip || context.target;
    if (!target) throw new Error('No target for nmap scan. Provide an IP or hostname.');

    await this.ensureTool('nmap');

    return this.safeExecute(step, context, async () => {
      const { stdout } = await this.runSandboxed('nmap', `nmap -sV -oX - "${target}"`, { timeout: 300000, network: true });

      this.broadcast('step:progress', { step: 'nmap', message: 'Scan complete' });

      return {
        tool: 'nmap',
        target,
        findings: [],
        raw: stdout.slice(0, 5000),
        summary: { target },
      };
    });
  }
}
