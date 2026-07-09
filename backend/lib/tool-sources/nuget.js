// NuGet source — for .NET projects

import { ToolSource } from './Source.js';

export class NuGetSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'nuget';
    this.label = 'NuGet';
    this.category = 'dotnet';
    this.homepage = 'https://www.nuget.org';
    this.baseUrl = 'https://azuresearch-usnc.nuget.org/query';
  }

  async search(query, opts = {}) {
    const { signal, limit = 5 } = opts;
    const results = [];

    try {
      const url = `${this.baseUrl}?q=${encodeURIComponent('security ' + query)}&take=${limit}&prerelease=false&semVerLevel=2.0.0`;
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return results;

      const data = await res.json();
      for (const pkg of (data.data || [])) {
        if (results.length >= limit) break;
        const name = pkg.id;
        if (results.find(r => r.name === name)) continue;
        results.push({
          name,
          description: (pkg.description || pkg.summary || '').slice(0, 200),
          url: `https://www.nuget.org/packages/${name}/`,
          stars: pkg.totalDownloads || 0,
          topics: pkg.tags || [],
          source: 'nuget',
          language: 'csharp',
          category: this.category,
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`NuGet search error: ${e.message}`);
    }

    return results;
  }
}
