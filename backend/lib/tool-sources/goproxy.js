// Go Proxy source — for Go projects
// Uses pkg.go.dev's search endpoint

import { ToolSource } from './Source.js';

export class GoProxySource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'goproxy';
    this.label = 'Go Proxy';
    this.category = 'go';
    this.homepage = 'https://pkg.go.dev';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://api.godoc.org/search?q=${encodeURIComponent('security ' + query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const data = await res.json();
      for (const pkg of (data.results || [])) {
        if (results.length >= limit) break;
        const name = pkg.path;
        if (!name || results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (pkg.synopsis || '').slice(0, 200),
          url: `https://pkg.go.dev/${name}`,
          stars: 0,
          topics: pkg.keywords || [],
          source: 'goproxy',
          language: 'go',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`Go proxy search error: ${e.message}`);
    }

    return results;
  }
}
