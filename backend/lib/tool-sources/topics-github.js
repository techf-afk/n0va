// GitHub Topics scraper — fetches github.com/topics/security pages
// Static HTML, no API needed, safe to scrape

import { ToolSource } from './Source.js';

const TOPIC_PAGES = [
  'security', 'security-scanner', 'static-analysis', 'vulnerability',
  'penetration-testing', 'bug-bounty', 'web-security', 'network-security',
];

export class GitHubTopicsSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'github-topics';
    this.label = 'GitHub Topics';
    this.category = 'general';
    this.homepage = 'https://github.com/topics/security';
    this._lastFetch = 0;
    this._cache = [];
    this._cacheTtlMs = 3600000; // 1 hour
  }

  async search(query, opts = {}) {
    const { language, limit = 5 } = opts;
    const results = [];

    // Use cache if fresh
    if (Date.now() - this._lastFetch < this._cacheTtlMs && this._cache.length > 0) {
      return this._filterResults(this._cache, language, query, limit);
    }

    // Fetch topic pages
    const allRepos = [];
    const topicsToFetch = TOPIC_PAGES.slice(0, 3); // Try 3 topics max

    for (const topic of topicsToFetch) {
      try {
        const url = `https://github.com/topics/${topic}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'n0va/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        // Extract repo cards: they're in <article> with repo names
        const repoRegex = /<a[^>]*href="\/([^\/"]+\/[^\/"]+)"[^>]*data-view-component="true"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = repoRegex.exec(html)) !== null) {
          const name = match[1];
          const desc = match[2].replace(/<[^>]+>/g, '').trim();
          if (name && !allRepos.find(r => r.name === name)) {
            allRepos.push({ name, description: desc.slice(0, 200), topics: [topic] });
          }
        }
      } catch {}
    }

    this._cache = allRepos;
    this._lastFetch = Date.now();

    return this._filterResults(allRepos, language, query, limit);
  }

  _filterResults(repos, language, query, limit) {
    const qLower = (query || '').toLowerCase();
    const results = [];

    for (const repo of repos) {
      if (results.length >= limit) break;
      const nameLower = repo.name.toLowerCase();
      // Filter by query if present
      if (qLower && !nameLower.includes(qLower) && !repo.description.toLowerCase().includes(qLower)) continue;
      results.push({
        ...repo,
        url: `https://github.com/${repo.name}`,
        stars: 0,
        source: 'github-topics',
        language: language || '',
        category: this.category,
      });
    }

    return results;
  }
}
