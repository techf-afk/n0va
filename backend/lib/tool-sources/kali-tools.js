// Kali Tools source — scrapes tools.kali.org for security tool listings
// Static HTML, safe to scrape

import { ToolSource } from './Source.js';

const KALI_TOOLS_URL = 'https://tools.kali.org/tools-listing';

export class KaliToolsSource extends ToolSource {
  constructor(config = {}) {
    super(config);
    this.id = 'kali-tools';
    this.label = 'Kali Tools';
    this.category = 'general';
    this.homepage = KALI_TOOLS_URL;
    this._cache = null;
    this._lastFetch = 0;
    this._cacheTtlMs = 86400000; // 24 hours
  }

  async _fetchToolList() {
    if (this._cache && Date.now() - this._lastFetch < this._cacheTtlMs) return this._cache;
    const tools = [];

    try {
      const res = await fetch(KALI_TOOLS_URL, {
        headers: { 'User-Agent': 'n0va/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      // Parse tool table rows
      const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const name = match[1].replace(/<[^>]+>/g, '').trim();
        const desc = match[2].replace(/<[^>]+>/g, '').trim();
        const category = match[3].replace(/<[^>]+>/g, '').trim();
        if (name) {
          tools.push({
            name,
            description: desc.slice(0, 200),
            url: `https://tools.kali.org/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            stars: 0,
            topics: category ? [category.toLowerCase().replace(/[^a-z0-9]+/g, '-')] : ['kali'],
            source: 'kali-tools',
            language: '',
            category: 'general',
          });
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`Kali tools fetch error: ${e.message}`);
    }

    this._cache = tools;
    this._lastFetch = Date.now();
    return tools;
  }

  async search(query, opts = {}) {
    const { language, limit = 5 } = opts;
    const allTools = await this._fetchToolList();
    const qLower = (query || '').toLowerCase();

    const results = [];
    for (const tool of allTools) {
      if (results.length >= limit) break;
      if (qLower && !tool.name.toLowerCase().includes(qLower) && !tool.description.toLowerCase().includes(qLower)) continue;
      results.push(tool);
    }

    return results;
  }
}
