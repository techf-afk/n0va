import { useState } from 'react';

export default function AddTool({ onToolAdded }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const examples = [
    'https://github.com/expressjs/express',
    'https://github.com/tj/commander.js',
    'https://github.com/axios/axios',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/tools/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setTimeout(() => onToolAdded(), 1500);
      } else {
        setError(data.error || 'Scan failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-text-primary text-lg font-bold mb-6">Add Tool</h2>

      <form onSubmit={handleSubmit} className="bg-surface-secondary border border-border rounded p-6 mb-6">
        <label className="text-text-secondary text-xs block mb-2 font-mono">
          ~$ scan github.com/repo
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 bg-surface border border-border rounded-md px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue text-sm font-mono"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-surface-secondary text-text-primary px-5 py-3 rounded hover:bg-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-sm border border-border"
          >
            {loading ? 'scanning...' : 'Scan'}
          </button>
        </div>

        {/* Examples */}
        <div className="mt-4 space-y-1.5">
          <div className="text-text-secondary text-[10px] uppercase tracking-wider">Examples</div>
          {examples.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setUrl(ex)}
              className="block text-xs text-accent-blue underline hover:opacity-80 transition-opacity font-mono"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {/* Result */}
      {loading && (
        <div className="bg-surface-secondary border border-border rounded p-4">
          <div className="text-text-secondary text-xs font-mono">
            <span className="text-accent-green">$</span> scanning repository...
          </div>
        </div>
      )}

      {result && (
        <div className="bg-surface-secondary border border-accent-green/30 rounded p-5">
          <div className="text-accent-green text-sm font-bold mb-2">Scan Complete</div>
          {result.tools?.map((tool, i) => (
            <div key={i} className="text-text-primary text-xs font-mono mb-1">
              <span className="text-accent-green">+</span> {tool.name}
              <span className="text-text-secondary"> ({tool.type})</span>
            </div>
          ))}
          {result.tools?.length === 0 && (
            <div className="text-text-secondary text-xs font-mono">No new tools found</div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-surface-secondary border border-accent-red/30 rounded p-4">
          <div className="text-accent-red text-sm font-bold mb-1">Error</div>
          <div className="text-text-secondary text-xs font-mono">{error}</div>
        </div>
      )}
    </div>
  );
}
