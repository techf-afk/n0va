// Maven Central source — for Java projects

import { ToolSource } from './Source.js';

export class MavenSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'maven';
    this.label = 'Maven Central';
    this.category = 'java';
    this.homepage = 'https://search.maven.org';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent('security ' + query)}&rows=${limit}&wt=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const data = await res.json();
      const docs = data?.response?.docs || [];
      for (const doc of docs) {
        if (results.length >= limit) break;
        const name = `${doc.g || ''}:${doc.a || ''}`;
        if (!name || results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (doc.description || '').slice(0, 200) || `Group: ${doc.g || '?'}, Artifact: ${doc.a || '?'}`,
          url: `https://search.maven.org/artifact/${doc.g || '?'}/${doc.a || '?'}`,
          stars: doc.downloads || 0,
          topics: doc.tags || [],
          source: 'maven-central',
          language: 'java',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`Maven search error: ${e.message}`);
    }

    return results;
  }
}
