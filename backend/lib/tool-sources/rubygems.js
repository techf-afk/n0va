// RubyGems source — for Ruby projects

import { ToolSource } from './Source.js';

export class RubyGemsSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'rubygems';
    this.label = 'RubyGems';
    this.category = 'ruby';
    this.homepage = 'https://rubygems.org';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent('security ' + query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const data = await res.json();
      for (const gem of (data || [])) {
        if (results.length >= limit) break;
        const name = gem.name;
        if (results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (gem.info || '').slice(0, 200),
          url: gem.project_uri || `https://rubygems.org/gems/${name}`,
          stars: gem.downloads || 0,
          topics: [],
          source: 'rubygems',
          language: 'ruby',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`RubyGems search error: ${e.message}`);
    }

    return results;
  }
}
