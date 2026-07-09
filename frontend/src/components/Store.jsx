import { useState, useEffect } from 'react';
import { EgressBanner, RiskBadge, RiskWarning } from './Safety.jsx';

function Chevron({ open }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FolderCard({ folder, tools, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [addToolId, setAddToolId] = useState('');

  const unassigned = tools.filter(t => !folder.members?.find(m => m.tool_id === t.id));

  const handleToggle = async () => {
    await fetch(`/api/store/folders/${folder.id}/toggle`, { method: 'POST' });
    onRefresh();
  };

  const handleAddTool = async () => {
    if (!addToolId) return;
    await fetch(`/api/store/folders/${folder.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId: parseInt(addToolId) }),
    });
    setAddToolId('');
    onRefresh();
  };

  const handleRemoveTool = async (toolId) => {
    await fetch(`/api/store/folders/${folder.id}/members/${toolId}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!target.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/store/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, target: target.trim() }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setRunning(false);
    }
  };

  const scanTypeBadge = folder.scan_type === 'web'
    ? 'text-accent-orange border-accent-orange/30 bg-accent-orange/10'
    : 'text-accent-blue border-accent-blue/30 bg-accent-blue/10';

  return (
    <div className="bg-surface-secondary border border-border rounded overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-dark/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-text-secondary"><Chevron open={open} /></span>
          <span className="text-text-primary text-sm font-bold">{folder.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${scanTypeBadge}`}>
            {folder.scan_type}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${folder.is_active ? 'text-accent-green border-accent-green/30' : 'text-text-secondary border-border'}`}>
            {folder.is_active ? 'active' : 'disabled'}
          </span>
          {folder.members && (
            <span className="text-text-secondary text-[11px] font-mono">{folder.members.length} tool{folder.members.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          className="text-[10px] text-text-secondary hover:text-text-primary px-2 py-1 rounded transition-colors border border-border"
        >
          {folder.is_active ? 'disable' : 'enable'}
        </button>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
          {folder.description && (
            <div className="text-text-secondary text-xs font-mono">{folder.description}</div>
          )}

          {/* Members */}
          <div>
            <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-2 font-mono">Tools</div>
            {folder.members?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {folder.members.map(m => (
                  <span key={m.tool_id} className="flex items-center gap-1.5 bg-surface-dark border border-border px-2 py-1 rounded text-[11px] font-mono">
                    <span className="text-text-primary">{m.tool_name}</span>
                    <span className="text-text-secondary">({m.tool_type})</span>
                    <RiskBadge level={risks[m.tool_name]} />
                    <button
                      onClick={() => handleRemoveTool(m.tool_id)}
                      className="text-accent-red/60 hover:text-accent-red ml-1 transition-colors"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-text-secondary text-xs font-mono">No tools in this folder</div>
            )}
          </div>

          {/* Add tool to folder */}
          {unassigned.length > 0 && (
            <div className="flex gap-2 items-center">
              <select
                value={addToolId}
                onChange={e => setAddToolId(e.target.value)}
                className="bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-blue"
              >
                <option value="">Add tool...</option>
                {unassigned.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                ))}
              </select>
              <button
                onClick={handleAddTool}
                disabled={!addToolId}
                className="text-[11px] px-2 py-1.5 bg-surface-dark border border-border rounded text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors font-mono"
              >
                + add
              </button>
            </div>
          )}

          {/* Execute */}
          <form onSubmit={handleExecute} className="flex gap-2">
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={folder.scan_type === 'web' ? 'https://example.com' : 'https://github.com/owner/repo'}
              className="flex-1 bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue"
              disabled={running}
            />
            <button
              type="submit"
              disabled={running || !target.trim() || !folder.is_active}
              className="bg-surface-dark text-text-primary px-4 py-2 rounded hover:bg-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-xs border border-border"
            >
              {running ? 'running...' : '$ run'}
            </button>
          </form>

          {/* Result */}
          {result && (
            <div className={`border rounded p-3 ${result.success ? 'border-accent-green/30' : 'border-accent-red/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${result.success ? 'text-accent-green' : 'text-accent-red'}`}>
                  {result.success ? '[RESULT]' : '[ERROR]'}
                </span>
                <span className="text-text-secondary text-[10px] font-mono">
                  #{result.executionId}
                </span>
              </div>
              {result.success ? (
                <div>
                  <div className="text-xs text-text-secondary font-mono mb-1">
                    Total findings: {result.report?.totalFindings ?? '?'}
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {(result.report?.streamedFindings || []).slice(0, 20).map((f, i) => (
                      <div key={i} className="text-[11px] text-text-primary font-mono border-b border-border pb-1">
                        <span className="text-text-secondary">[{f._tool || f.tool}]</span> {f.message || ''}
                      </div>
                    ))}
                    {(result.report?.streamedFindings || []).length > 20 && (
                      <div className="text-[10px] text-text-secondary font-mono">+{result.report.streamedFindings.length - 20} more</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-accent-red font-mono">{result.error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Store({ tools, onRefresh }) {
  const [folders, setFolders] = useState([]);
  const [usage, setUsage] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('repo');
  const [pulling, setPulling] = useState(false);
  const [risks, setRisks] = useState({});

  useEffect(() => {
    fetch('/api/tools/risk').then(r => r.json()).then(d => setRisks(d.risks || {})).catch(() => {});
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/store/folders');
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {}
  };

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/store/usage');
      const data = await res.json();
      setUsage(data.usage);
    } catch {}
  };

  useEffect(() => { fetchFolders(); fetchUsage(); }, []);

  const handleRefresh = async () => {
    await fetchFolders();
    onRefresh?.();
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await fetch('/api/store/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), scanType: newType }),
    });
    setNewName('');
    setNewDesc('');
    setShowNew(false);
    await handleRefresh();
  };

  const handlePullTools = async () => {
    setPulling(true);
    try {
      await fetch('/api/store/pull', { method: 'POST' });
      await fetchUsage();
    } catch {}
    setPulling(false);
  };

  return (
    <div>
      <EgressBanner />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-text-primary text-lg font-bold">Store</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(!showNew)}
            className="text-[11px] px-3 py-1.5 bg-surface-dark border border-border rounded text-text-primary hover:bg-border transition-colors font-mono"
          >
            ~$ new folder
          </button>
          <button
            onClick={handlePullTools}
            disabled={pulling}
            className="text-[11px] px-3 py-1.5 bg-surface-dark border border-border rounded text-text-primary hover:bg-border disabled:opacity-40 transition-colors font-mono"
          >
            {pulling ? 'pulling...' : '~$ pull all'}
          </button>
        </div>
      </div>

      {/* Disk usage bar */}
      {usage && (
        <div className="bg-surface-dark border border-border rounded p-3 mb-4">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
            <span className="text-text-secondary">Clone cache</span>
            <span className="text-text-secondary">{usage.usedGB} GB / {usage.totalGB} GB</span>
          </div>
          <div className="w-full bg-surface rounded h-2 overflow-hidden border border-border">
            <div
              className={`h-full rounded transition-all ${parseFloat(usage.percent) > 85 ? 'bg-accent-red' : 'bg-accent-blue'}`}
              style={{ width: `${Math.min(100, parseFloat(usage.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* New folder form */}
      {showNew && (
        <form onSubmit={handleCreateFolder} className="bg-surface-dark border border-border rounded p-4 mb-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Folder name"
            className="w-full bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue"
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue"
          />
          <div className="flex gap-2 items-center">
            <span className="text-text-secondary text-[11px] font-mono">Scan type:</span>
            {['repo', 'web'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setNewType(t)}
                className={`text-[11px] px-2 py-1 rounded border font-mono ${
                  newType === t
                    ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                    : 'bg-surface text-text-secondary border-border'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!newName.trim()}
              className="text-[11px] px-3 py-1.5 bg-surface border border-border rounded text-text-primary hover:bg-border disabled:opacity-40 transition-colors font-mono">
              ~$ create
            </button>
            <button type="button" onClick={() => setShowNew(false)}
              className="text-[11px] px-3 py-1.5 text-text-secondary hover:text-text-primary transition-colors font-mono">
              cancel
            </button>
          </div>
        </form>
      )}

      {/* Folder list */}
      {folders.length === 0 ? (
        <div className="bg-surface-dark border border-border rounded p-8 text-center">
          <div className="text-text-secondary text-sm mb-2 font-mono">No folders yet</div>
          <div className="text-text-secondary text-xs font-mono">Create a folder to organize scan pipelines</div>
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map(f => (
            <FolderCard key={f.id} folder={f} tools={tools} onRefresh={handleRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
