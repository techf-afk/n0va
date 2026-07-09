import { useState, useEffect } from 'react';

export default function ToolGrid({ tools, onRefresh }) {
  const types = ['all', 'cli', 'api', 'library', 'service', 'other'];
  const [filter, setFilter] = useState('all');
  const [status, setStatus] = useState({});

  useEffect(() => {
    fetch('/api/tools/status').then(r => r.json()).then(d => setStatus(d.installed || {})).catch(() => {});
  }, []);

  const filtered = filter === 'all' ? tools : tools.filter(t => t.type === filter);

  const typeColors = {
    cli: 'text-accent-blue border-accent-blue/30 bg-accent-blue/10',
    api: 'text-accent-green border-accent-green/30 bg-accent-green/10',
    library: 'text-accent-orange border-accent-orange/30 bg-accent-orange/10',
    service: 'text-text-secondary border-border bg-surface-dark',
    other: 'text-text-secondary border-border bg-surface-dark',
  };

  if (tools.length === 0) {
    return (
      <div className="bg-surface-secondary border border-border rounded p-8 text-center">
        <div className="text-text-secondary text-sm mb-2">No tools registered</div>
        <div className="text-text-secondary text-xs">
          Go to <span className="text-accent-blue">Add Tool</span> to register a security tool
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 flex-wrap">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`
                px-3 py-1.5 rounded text-[11px] font-mono transition-colors uppercase tracking-wider
                ${filter === t
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'bg-surface-secondary text-text-secondary border border-border hover:bg-border'
                }
              `}
            >
              {t === 'all' ? `all (${tools.length})` : t}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          className="text-text-secondary hover:text-text-primary text-xs transition-colors font-mono"
        >
          ~$ refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(tool => (
          <div
            key={tool.id}
            className="bg-surface-secondary border border-border rounded p-5 hover:border-accent-blue/40 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-text-primary text-sm font-bold">{tool.name}</div>
                <div className="text-text-secondary text-[11px] mt-1">{tool.description || ''}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${typeColors[tool.type] || typeColors.other}`}>
                {tool.type}
              </span>
              {status[tool.name] !== undefined && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-mono ml-2 ${status[tool.name] ? 'text-accent-green border-accent-green/30 bg-accent-green/10' : 'text-text-secondary border-border'}`}
                  title={status[tool.name] ? 'binary installed' : 'binary not found on host'}
                >
                  {status[tool.name] ? '● installed' : '○ missing'}
                </span>
              )}
            </div>

            {tool.capabilities?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tool.capabilities.slice(0, 4).map((cap, i) => (
                  <span key={i} className="text-[10px] text-text-secondary bg-surface-dark px-2 py-0.5 rounded border border-border">
                    {cap}
                  </span>
                ))}
                {tool.capabilities.length > 4 && (
                  <span className="text-[10px] text-text-secondary">+{tool.capabilities.length - 4}</span>
                )}
              </div>
            )}

            {tool.repo_url && (
              <a
                href={tool.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-text-secondary underline mt-3 inline-block hover:opacity-80 transition-opacity"
              >
                {tool.repo_url}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
