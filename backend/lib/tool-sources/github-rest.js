// GitHub Search API source
// Rate limit: 60/hr unauthenticated, 5000/hr with GITHUB_TOKEN
// This is our primary source — used for every query

import { ToolSource } from './Source.js';

export class GitHubRestSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'github';
    this.label = 'GitHub';
    this.category = 'general';
    this.homepage = 'https://github.com';
    this.githubToken = config.githubToken || process.env.GITHUB_TOKEN || '';
    this._requestCount = 0;
  }

  async search(query, opts = {}) {
    const { language, topic = 'security', limit = 5, signal } = opts;
    const results = [];

    // Build query: try topic:security + language first, fallback to broader
    const queries = [];
    if (language) {
      queries.push(`${query}+language:${language}+topic:${topic}`);
      queries.push(`${query}+language:${language}`);
    }
    queries.push(`${query}+topic:${topic}`);
    queries.push(query);

    for (const q of queries) {
      if (results.length >= limit) break;
      try {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.githubToken) headers['Authorization'] = `token ${this.githubToken}`;

        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=${limit}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });

        this._requestCount++;
        if (!res.ok) {
          if (res.status === 403) {
            console.warn('GitHub API rate limited. Set GITHUB_TOKEN for more.');
            break;
          }
          if (res.status === 422) continue;
          break;
        }

        const data = await res.json();
        for (const item of (data.items || [])) {
          if (results.length >= limit) break;
          const name = item.full_name;
          if (results.find(r => r.name === name)) continue;
          results.push({
            name,
            description: (item.description || '').slice(0, 200),
            url: item.html_url,
            stars: item.stargazers_count,
            topics: item.topics || [],
            source: 'github',
            language: item.language || '',
            category: this.category,
          });
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.warn(`GitHub search error: ${e.message}`);
      }
    }

    return results;
  }
}
