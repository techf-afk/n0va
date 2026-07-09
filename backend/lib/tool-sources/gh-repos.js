import { execFile } from 'child_process';
import { ToolSource } from './Source.js';

export class GhReposSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'gh-cli';
    this.label = 'GitHub CLI';
    this.category = 'general';
    this.homepage = 'https://github.com';
    this.timeoutMs = 10000;
  }

  async search(query, opts = {}) {
    const { language, topic = 'security', limit = 5, signal } = opts;
    const results = [];

    const queries = [];
    if (language) {
      queries.push(`${query}+language:${language}+topic:${topic}`);
      queries.push(`${query}+language:${language}`);
    }
    queries.push(`${query}+topic:${topic}`);
    queries.push(query);

    for (const q of queries) {
      if (results.length >= limit) break;
      const ghQuery = q.replace(/\+/g, ' ');
      try {
        const { stdout } = await this._execGh(ghQuery, limit, signal);
        if (!stdout) continue;

        const items = JSON.parse(stdout);
        for (const item of items) {
          if (results.length >= limit) break;
          const name = item.fullName;
          if (results.find(r => r.name === name)) continue;
          results.push({
            name,
            description: (item.description || '').slice(0, 200),
            url: item.url,
            stars: item.stargazersCount || 0,
            topics: [],
            source: 'gh-cli',
            language: item.language || '',
            category: this.category,
          });
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        const msg = e.stderr || e.message || '';
        if (msg.includes('no results') || msg.includes('not found') || e.code === 1) continue;
        console.warn(`gh-repos search error: ${e.message}`, { stderr: e.stderr });
      }
    }

    return results;
  }

  _execGh(query, limit, signal) {
    return new Promise((resolve, reject) => {
      const child = execFile(
        'gh',
        [
          'search', 'repos', query,
          '--json', 'fullName,description,stargazersCount,url,language',
          '--limit', String(limit),
        ],
        { maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            err.stderr = stderr;
            err.stdout = stdout;
            reject(err);
            return;
          }
          resolve({ stdout, stderr });
        }
      );

      if (signal) {
        const onAbort = () => {
          child.kill('SIGTERM');
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        child.on('exit', () => signal.removeEventListener('abort', onAbort));
      }
    });
  }
}
