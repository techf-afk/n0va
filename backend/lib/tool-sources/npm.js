// npm registry source — for JavaScript/TypeScript projects

import { ToolSource } from './Source.js';

export class NpmSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'npm';
    this.label = 'npm';
    this.category = 'javascript';
    this.homepage = 'https://www.npmjs.com';
    this.baseUrl = 'https://registry.npmjs.org/-/v1/search';
  }

  _isSecurityTool(name, description, keywords) {
    const secKeywords = ['security', 'vulnerability', 'audit', 'scanner', 'malware',
      'threat', 'exploit', 'cve', 'cwe', 'sast', 'secret', 'compliance'];
    const text = `${name} ${description} ${(keywords || []).join(' ')}`.toLowerCase();
    return secKeywords.some(k => text.includes(k));
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    const searches = [
      `keywords:security+scanner+${encodeURIComponent(query)}`,
      `keywords:security+audit+${encodeURIComponent(query)}`,
      `security+${encodeURIComponent(query)}`,
    ];

    for (const sq of searches) {
      if (results.length >= limit) break;
      try {
        const url = `${this.baseUrl}?text=${sq}&size=${limit * 2}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
        if (!res.ok) continue;

        const data = await res.json();
        for (const obj of (data.objects || [])) {
          if (results.length >= limit) break;
          const pkg = obj.package || {};
          if (!pkg.name || pkg.name.startsWith('@')) continue;
          if (results.find(r => r.name === pkg.name)) continue;
          if (!this._isSecurityTool(pkg.name, pkg.description, pkg.keywords)) continue;

          const popularity = Math.round((obj.score?.detail?.popularity || 0) * 100);
          results.push({
            name: pkg.name,
            description: (pkg.description || '').slice(0, 200),
            url: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
            stars: popularity,
            topics: pkg.keywords || [],
            source: 'npm',
            language: 'javascript',
            category: this.category,
          });
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.warn(`npm search error: ${e.message}`);
      }
    }

    return results;
  }
}
