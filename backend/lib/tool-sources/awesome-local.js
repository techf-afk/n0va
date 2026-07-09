// Awesome Lists source — clones awesome-security repos and searches locally
// Zero ongoing API cost after initial clone

import { ToolSource } from './Source.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const AWESOME_DIR = join(os.homedir(), '.tool-orchestrator', 'awesome-lists');
const AWESOME_REPOS = [
  { name: 'awesome-security', url: 'https://github.com/sindresorhus/awesome.git' },
  { name: 'awesome-web-security', url: 'https://github.com/qazbnm456/awesome-web-security.git' },
  { name: 'awesome-appsec', url: 'https://github.com/paragonie/awesome-appsec.git' },
  { name: 'awesome-pentest', url: 'https://github.com/enaqx/awesome-pentest.git' },
  { name: 'awesome-hacking', url: 'https://github.com/Hack-with-Github/Awesome-Hacking.git' },
];

export class AwesomeLocalSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'awesome';
    this.label = 'Awesome Lists';
    this.category = 'general';
    this.homepage = 'https://github.com/topics/awesome';
    this._initialized = false;
  }

  async _ensureCloned() {
    if (this._initialized) return;
    this._initialized = true;

    if (!existsSync(AWESOME_DIR)) {
      mkdirSync(AWESOME_DIR, { recursive: true });
    }

    for (const repo of AWESOME_REPOS) {
      const dest = join(AWESOME_DIR, repo.name);
      if (!existsSync(dest)) {
        try {
          execSync(`git clone --depth 1 "${repo.url}" "${dest}"`, {
            encoding: 'utf-8', timeout: 30000, stdio: 'pipe',
          });
        } catch (e) {
          console.warn(`Failed to clone ${repo.name}: ${e.message}`);
        }
      }
    }
  }

  async search(query, opts = {}) {
    const { language, limit = 5 } = opts;
    const results = [];
    await this._ensureCloned();

    const qLower = (query || '').toLowerCase();

    for (const repo of AWESOME_REPOS) {
      const readmePath = join(AWESOME_DIR, repo.name, 'README.md');
      if (!existsSync(readmePath)) continue;

      try {
        const content = readFileSync(readmePath, 'utf-8');
        // Find bullet points with links: "- [name](url) - description"
        const linkRegex = /[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[-–—]\s*([^\n]*)/gi;
        let match;
        while ((match = linkRegex.exec(content)) !== null && results.length < limit * 2) {
          const name = match[1].trim();
          const url = match[2].trim();
          const desc = match[3].trim();
          if (!name || !url || results.find(r => r.name === name)) continue;
          if (qLower && !name.toLowerCase().includes(qLower) && !desc.toLowerCase().includes(qLower)) continue;

          // Try to detect language from URL
          let lang = '';
          if (url.includes('npmjs') || url.includes('js.org') || url.includes('node')) lang = 'javascript';
          else if (url.includes('pypi') || url.includes('python')) lang = 'python';
          else if (url.includes('crates.io') || url.includes('rust')) lang = 'rust';
          else if (url.includes('rubygems') || url.includes('ruby')) lang = 'ruby';
          else if (url.includes('packagist') || url.includes('php')) lang = 'php';

          if (language && lang && lang !== language) continue;

          results.push({
            name,
            description: desc.slice(0, 200),
            url,
            stars: 0,
            topics: [repo.name.replace('awesome-', '')],
            source: 'awesome',
            language: lang,
            category: this.category,
          });
        }
      } catch {}
    }

    return results.slice(0, limit);
  }
}
