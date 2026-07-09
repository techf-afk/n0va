import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BaseAdapter } from './base.js';

export class GitCloneAdapter extends BaseAdapter {
  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    return action === 'clone' || action === 'git-clone' || action === 'checkout' ||
      action === 'fetch' || action === 'download';
  }

  extractRepoName(repoUrl) {
    const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || `repo-${Date.now()}`;
  }

  async execute(step, context) {
    const repoUrl = step.inputs?.repoUrl || step.inputs?.repository || step.inputs?.url || context.repoUrl;
    if (!repoUrl) {
      if (context.repoPath) return { repoPath: context.repoPath, cached: true };
      throw new Error('No repoUrl provided for clone');
    }

    if (!existsSync(this.reposDir)) {
      mkdirSync(this.reposDir, { recursive: true });
    }

    const repoName = this.extractRepoName(repoUrl);
    const repoPath = join(this.reposDir, repoName);

    if (existsSync(repoPath)) {
      this.broadcast('step:progress', { step: 'clone', message: `Repo already cloned at ${repoPath}` });
      return { repoPath, cached: true };
    }

    this.broadcast('step:progress', { step: 'clone', message: `Cloning ${repoUrl}...` });
    const { exitCode, stderr } = await this.runAsync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, { timeout: 120000 });
    if (exitCode !== 0) throw new Error(`git clone failed: ${stderr}`);
    this.broadcast('step:progress', { step: 'clone', message: `Cloned to ${repoPath}` });

    return { repoPath, cached: false };
  }
}
