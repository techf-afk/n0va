// Cache layer — torlink-style in-memory cache with TTL
// Key: sourceId::normalizedQuery::language
// TTL: 5 minutes (300s) for API sources, longer for scraped

const TTL = {
  default: 5 * 60 * 1000,
  'github-topics': 60 * 60 * 1000,
  'kali-tools': 24 * 60 * 60 * 1000,
  'awesome': 60 * 60 * 1000,
};

const _cache = new Map();

export function cachedSearch(source, query, opts = {}) {
  const key = `${source.id}::${(query || '').toLowerCase().trim()}::${(opts.language || '')}`;
  const hit = _cache.get(key);
  const ttl = TTL[source.id] || TTL.default;

  if (hit && Date.now() - hit.at < ttl) {
    return Promise.resolve(hit.results);
  }

  return Promise.resolve(source.search(query, opts)).then(results => {
    _cache.set(key, { at: Date.now(), results });
    return results;
  });
}

export function clearCache() {
  _cache.clear();
}
