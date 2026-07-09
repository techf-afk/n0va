// Source Registry — torlink-style parallel search execution
// Defines all sources, fires them in parallel, dedups, ranks, and streams results

import { GitHubRestSource } from './github-rest.js';
import { GhReposSource } from './gh-repos.js';
import { NpmSource } from './npm.js';
import { PyPISource } from './pypi.js';
import { CratesSource } from './crates.js';
import { RubyGemsSource } from './rubygems.js';
import { PackagistSource } from './packagist.js';
import { NuGetSource } from './nuget.js';
import { MavenSource } from './maven.js';
import { GoProxySource } from './goproxy.js';
import { GitHubTopicsSource } from './topics-github.js';
import { KaliToolsSource } from './kali-tools.js';
import { AwesomeLocalSource } from './awesome-local.js';
import { ExploitDBSource } from './exploitdb.js';
import { cachedSearch } from './cache.js';

// Language → which sources to fire
const LANGUAGE_SOURCES = {
  'javascript': ['github', 'gh-cli', 'npm', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'typescript': ['github', 'gh-cli', 'npm', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'python': ['github', 'gh-cli', 'pypi', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'rust': ['github', 'gh-cli', 'crates', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'ruby': ['github', 'gh-cli', 'rubygems', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'php': ['github', 'gh-cli', 'packagist', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'csharp': ['github', 'gh-cli', 'nuget', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'java': ['github', 'gh-cli', 'maven', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
  'go': ['github', 'gh-cli', 'goproxy', 'github-topics', 'awesome', 'exploitdb', 'kali-tools'],
};

const WEB_SOURCES = ['github', 'gh-cli', 'github-topics', 'exploitdb', 'kali-tools'];

// Per-source timeout (torlink uses 25s, we use 10s)
const PER_SOURCE_TIMEOUT_MS = 10000;

export class SourceRegistry {
  constructor(config = {}) {
    const sources = [
      new GitHubRestSource(config),
      new GhReposSource(config),
      new NpmSource(config),
      new PyPISource(config),
      new CratesSource(config),
      new RubyGemsSource(config),
      new PackagistSource(config),
      new NuGetSource(config),
      new MavenSource(config),
      new GoProxySource(config),
      new GitHubTopicsSource(config),
      new KaliToolsSource(config),
      new AwesomeLocalSource(config),
      new ExploitDBSource(config),
    ];

    this._byId = {};
    for (const s of sources) {
      this._byId[s.id] = s;
    }
  }

  // Select which sources to fire based on language
  _selectSources(language) {
    if (language && LANGUAGE_SOURCES[language]) {
      return LANGUAGE_SOURCES[language]
        .map(id => this._byId[id])
        .filter(Boolean);
    }
    return WEB_SOURCES.map(id => this._byId[id]).filter(Boolean);
  }

  // Parallel search — torlink's core pattern
  async searchAll(query, language, limit = 6) {
    const sources = this._selectSources(language);
    const allResults = [];
    const perSource = {};

    // Fire all sources in parallel with individual timeouts
    const promises = sources.map(source => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), PER_SOURCE_TIMEOUT_MS);

      return cachedSearch(source, query, { language, signal: ac.signal, limit })
        .then(results => {
          allResults.push(...results);
          perSource[source.id] = { ok: true, count: results.length };
        })
        .catch(e => {
          perSource[source.id] = { ok: false, error: e.message };
        })
        .finally(() => clearTimeout(timer));
    });

    await Promise.all(promises);

    // Source priority for ranking (GitHub results should rank higher)
    const SOURCE_PRIORITY = {
      'github': 100, 'gh-cli': 110, 'npm': 80, 'pypi': 80, 'crates.io': 80, 'rubygems': 80,
      'packagist': 80, 'nuget': 80, 'maven-central': 80, 'goproxy': 80,
      'github-topics': 60, 'awesome': 50, 'kali-tools': 40, 'exploit-db': 30,
    };

    // Dedup by name — keep the one with higher source priority, then higher stars
    const byName = new Map();
    for (const r of allResults) {
      const existing = byName.get(r.name);
      const rScore = (SOURCE_PRIORITY[r.source] || 50);
      const eScore = existing ? (SOURCE_PRIORITY[existing.source] || 50) : 0;
      if (!existing || rScore > eScore || (rScore === eScore && r.stars > existing.stars)) {
        byName.set(r.name, r);
      }
    }

    // Rank: source priority desc, then stars desc
    const ranked = [...byName.values()]
      .sort((a, b) => {
        const pa = SOURCE_PRIORITY[a.source] || 50;
        const pb = SOURCE_PRIORITY[b.source] || 50;
        if (pa !== pb) return pb - pa;
        return (b.stars || 0) - (a.stars || 0);
      })
      .slice(0, limit);

    return {
      discovered: ranked,
      totalFound: byName.size,
      perSource,
    };
  }
}
