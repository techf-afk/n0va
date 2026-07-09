// Packagist source — for PHP projects

import { ToolSource } from './Source.js';

export class PackagistSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'packagist';
    this.label = 'Packagist';
    this.category = 'php';
    this.homepage = 'https://packagist.org';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://packagist.org/search.json?q=${encodeURIComponent('security ' + query)}&per_page=${limit}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const data = await res.json();
      for (const pkg of (data.results || [])) {
        if (results.length >= limit) break;
        const name = pkg.name;
        if (results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (pkg.description || '').slice(0, 200),
          url: `https://packagist.org/packages/${name}`,
          stars: pkg.downloads || 0,
          topics: [],
          source: 'packagist',
          language: 'php',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`Packagist search error: ${e.message}`);
    }

    return results;
  }
}
