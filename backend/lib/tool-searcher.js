// Tool Searcher
// Discovers security tools from GitHub + package registries based on target's tech stack
// Teaches: what security tools exist for each ecosystem, how to find them

const REGISTRY_SEARCH = {
  'npm': { url: (q) => `https://registry.npmjs.org/-/v1/search?text=keywords:security+${encodeURIComponent(q)}&size=10`, parser: parseNpmResults },
  'python': { url: (q) => `https://pypi.org/simple/`, parser: null }, // PyPI needs different approach
  'ruby': { url: (q) => `https://rubygems.org/api/v1/search?query=security+${encodeURIComponent(q)}`, parser: parseGemResults },
  'rust': { url: (q) => `https://crates.io/api/v1/crates?q=security+${encodeURIComponent(q)}&per_page=10`, parser: parseCargoResults },
  'php': { url: (q) => `https://packagist.org/search.json?q=security+${encodeURIComponent(q)}`, parser: parsePackagistResults },
  'go': { url: (q) => `https://proxy.golang.org/`, parser: null },
};

const LANGUAGE_QUERIES = {
  'javascript': ['javascript security scanner', 'javascript vulnerability scanner', 'npm audit tool', 'nodejs security'],
  'typescript': ['typescript security scanner', 'typescript static analysis security'],
  'python': ['python security scanner', 'python vulnerability scanner', 'python static analysis'],
  'go': ['go security scanner', 'golang vulnerability scanner', 'go static analysis'],
  'rust': ['rust security scanner', 'rust vulnerability scanner'],
  'ruby': ['ruby security scanner', 'rails security scanner'],
  'php': ['php security scanner', 'php vulnerability scanner'],
  'java': ['java security scanner', 'java vulnerability scanner', 'java static analysis'],
  'csharp': ['csharp security scanner', 'dotnet security scanner', 'csharp vulnerability scanner'],
  'cpp': ['cpp security scanner', 'cpp static analysis', 'cpp vulnerability scanner'],
  'solidity': ['solidity security scanner', 'smart contract security scanner'],
  'docker': ['docker security scanner', 'container vulnerability scanner', 'docker image scanner'],
};

const WEB_QUERIES = [
  'web security scanner', 'web vulnerability scanner', 'web application firewall',
  'subdomain discovery', 'web reconnaissance tool', 'xss scanner',
];

const IGNORED_TOOLS = new Set([
  'git-clone', 'report-merger',
]);

export class ToolSearcher {
  constructor(config = {}) {
    this.githubToken = config.githubToken || process.env.GITHUB_TOKEN || '';
    this.registry = config.registry || null;
  }

  // Search GitHub for security tools matching a language
  async searchGithub(language, limit = 5) {
    const queries = LANGUAGE_QUERIES[language] || [`${language} security scanner`];
    const results = [];

    for (const query of queries.slice(0, 2)) {
      try {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.githubToken) headers['Authorization'] = `token ${this.githubToken}`;

        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+language:${language}+topic:security&sort=stars&per_page=${limit}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });

        if (!res.ok) {
          console.warn(`GitHub search failed (${res.status}) for: ${query}`);
          continue;
        }

        const data = await res.json();
        for (const item of (data.items || []).slice(0, limit)) {
          const name = item.full_name;
          if (IGNORED_TOOLS.has(name) || results.find(r => r.name === name)) continue;

          // Skip if already in registry
          if (this.registry?.getToolByName(name)) continue;

          results.push({
            name,
            description: item.description || '',
            url: item.html_url,
            stars: item.stargazers_count,
            topics: item.topics || [],
            source: 'github',
            language: item.language,
          });
        }
      } catch (e) {
        console.warn(`GitHub search error for "${query}": ${e.message}`);
      }
    }

    return results.sort((a, b) => b.stars - a.stars);
  }

  // Search language-specific registries for security tools
  async searchRegistry(language, limit = 5) {
    const results = [];

    // Map language to registry
    let registryKey = null;
    if (['javascript', 'typescript'].includes(language)) registryKey = 'npm';
    else if (['python'].includes(language)) registryKey = 'python';
    else if (['ruby'].includes(language)) registryKey = 'ruby';
    else if (['rust'].includes(language)) registryKey = 'rust';
    else if (['php'].includes(language)) registryKey = 'php';
    else if (['go'].includes(language)) registryKey = 'go';

    if (!registryKey || !REGISTRY_SEARCH[registryKey]) return results;

    const registry = REGISTRY_SEARCH[registryKey];
    if (!registry.parser) return results; // No parser available yet

    const queries = LANGUAGE_QUERIES[language] || ['security'];
    for (const query of queries.slice(0, 1)) {
      try {
        const res = await fetch(registry.url(query), {
          signal: AbortSignal.timeout(5000),
          headers: registryKey === 'rust' ? { 'User-Agent': 'n0va/1.0' } : {},
        });
        if (!res.ok) continue;
        const data = await res.json();
        const items = registry.parser(data, query, language);
        for (const item of items.slice(0, limit)) {
          if (!results.find(r => r.name === item.name)) {
            results.push(item);
          }
        }
      } catch (e) {
        console.warn(`Registry search error for ${registryKey}: ${e.message}`);
      }
    }

    return results;
  }

  // Search web tools when no language is detected
  async searchWebTools(limit = 5) {
    const results = [];

    for (const query of WEB_QUERIES.slice(0, 3)) {
      try {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.githubToken) headers['Authorization'] = `token ${this.githubToken}`;

        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+topic:security&sort=stars&per_page=${limit}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;

        const data = await res.json();
        for (const item of (data.items || []).slice(0, limit)) {
          const name = item.full_name;
          if (IGNORED_TOOLS.has(name) || results.find(r => r.name === name)) continue;
          results.push({
            name,
            description: item.description || '',
            url: item.html_url,
            stars: item.stargazers_count,
            topics: item.topics || [],
            source: 'github',
            language: item.language || '',
          });
        }
      } catch {}
    }

    return results.sort((a, b) => b.stars - a.stars);
  }

  // Full search: GitHub + registries, deduped and ranked
  async searchTools(language, lockfiles, topics, limit = 8) {
    let githubResults;
    let registryResults;

    if (language) {
      [githubResults, registryResults] = await Promise.all([
        this.searchGithub(language, limit),
        this.searchRegistry(language, limit),
      ]);
    } else {
      githubResults = await this.searchWebTools(limit);
      registryResults = [];
    }

    // Merge: GitHub first, then registry (deduped by name)
    const seen = new Set();
    const all = [];

    for (const r of githubResults) {
      if (!seen.has(r.name)) {
        seen.add(r.name);
        all.push(r);
      }
    }
    for (const r of registryResults) {
      if (!seen.has(r.name)) {
        seen.add(r.name);
        all.push(r);
      }
    }

    // Teach: explain what was found
    const summary = buildSummary(all, language || 'web');

    return {
      discovered: all.slice(0, limit),
      totalFound: all.length,
      summary,
    };
  }
}

// --- Registry parsers ---

function parseNpmResults(data) {
  return (data.objects || []).map(obj => {
    const pkg = obj.package || {};
    return {
      name: pkg.name || '',
      description: pkg.description || '',
      url: pkg.links?.npm || '',
      stars: obj.score?.detail?.quality || 0,
      topics: pkg.keywords || [],
      source: 'npm',
      language: 'javascript',
    };
  }).filter(r => r.name && !r.name.startsWith('@'));
}

function parseGemResults(data) {
  return (data || []).map(gem => ({
    name: gem.name || '',
    description: gem.info || '',
    url: gem.project_uri || '',
    stars: gem.downloads || 0,
    topics: [],
    source: 'rubygems',
    language: 'ruby',
  }));
}

function parseCargoResults(data) {
  return (data.crates || []).map(c => ({
    name: c.name || '',
    description: c.description || '',
    url: `https://crates.io/crates/${c.name}`,
    stars: c.downloads || 0,
    topics: c.keywords || [],
    source: 'crates.io',
    language: 'rust',
  }));
}

function parsePackagistResults(data) {
  const results = data.results || [];
  return results.map(pkg => ({
    name: pkg.name || '',
    description: pkg.description || '',
    url: pkg.url || '',
    stars: pkg.downloads || 0,
    topics: [],
    source: 'packagist',
    language: 'php',
  }));
}

function buildSummary(tools, language) {
  if (tools.length === 0) {
    return `No security tools discovered for ${language}. Try adding a GITHUB_TOKEN for more results.`;
  }
  const top = tools.slice(0, 3);
  const names = top.map(t => t.name.split('/').pop() || t.name);
  const stars = top.map(t => t.stars > 0 ? `${t.stars.toLocaleString()} stars` : 'new');
  return `Discovered ${tools.length} ${language} security tools. Top: ${names.map((n, i) => `${n} (${stars[i]})`).join(', ')}.`;
}
