// crates.io source — for Rust projects

import { ToolSource } from './Source.js';

export class CratesSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'crates';
    this.label = 'crates.io';
    this.category = 'rust';
    this.homepage = 'https://crates.io';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent('security ' + query)}&per_page=${limit}&sort=downloads`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'n0va-security-orchestrator/1.0' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return results;

      const data = await res.json();
      for (const c of (data.crates || [])) {
        if (results.length >= limit) break;
        const name = c.name;
        if (results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (c.description || '').slice(0, 200),
          url: `https://crates.io/crates/${c.name}`,
          stars: c.downloads || 0,
          topics: c.keywords || [],
          source: 'crates.io',
          language: 'rust',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`crates.io search error: ${e.message}`);
    }

    return results;
  }
}
