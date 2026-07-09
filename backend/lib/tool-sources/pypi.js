// PyPI source — for Python projects

import { ToolSource } from './Source.js';

export class PyPISource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'pypi';
    this.label = 'PyPI';
    this.category = 'python';
    this.homepage = 'https://pypi.org';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://pypi.org/search/?q=${encodeURIComponent('security ' + query)}&o=&c=`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const html = await res.text();
      const itemRegex = /<a class="package-snippet"[^>]*href="\/project\/([^"]+)"[^>]*>[\s\S]*?<span class="package-snippet__name">([^<]+)<\/span>[\s\S]*?<p class="package-snippet__description">([^<]*)<\/p>[\s\S]*?<span class="package-snippet__author">[\s\S]*?<\/span>[\s\S]*?<\/a>/gi;
      let match;
      while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
        const name = match[2].trim();
        if (results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (match[3] || '').trim().slice(0, 200),
          url: `https://pypi.org/project/${match[1].replace(/\/$/,'')}/`,
          stars: 0,
          topics: [],
          source: 'pypi',
          language: 'python',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`PyPI search error: ${e.message}`);
    }

    return results;
  }
}
