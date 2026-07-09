import { useState, useRef, useEffect } from 'react';

// Persistent bottom terminal strip (VS Code-style). Lives in App, never unmounts,
// so history + running commands survive tab switches.
// mode: 'collapsed' (32px bar) | 'open' (200px strip) | 'full' (85vh).
export default function TerminalPanel() {
  const [mode, setMode] = useState('open');
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const outRef = useRef(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [history, running]);

  const run = async () => {
    const c = cmd.trim();
    if (!c || running) return;
    setRunning(true);
    setCmd('');
    try {
      const res = await fetch('/api/console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: c }),
      });
      const data = await res.json();
      setHistory(h => [...h, {
        cmd: c,
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        exitCode: data.exitCode ?? -1,
        ts: Date.now(),
      }]);
    } catch (e) {
      setHistory(h => [...h, { cmd: c, stdout: '', stderr: e.message, exitCode: -1, ts: Date.now() }]);
    } finally {
      setRunning(false);
    }
  };

  if (mode === 'collapsed') {
    return (
      <div
        className="shrink-0 h-8 bg-surface-dark border-t border-border flex items-center px-3 gap-2 cursor-pointer hover:bg-surface-secondary/50 transition-colors"
        onClick={() => setMode('open')}
      >
        <span className="text-accent-green font-mono text-xs">{'>_'}</span>
        <span className="text-text-secondary text-[11px] font-mono">Terminal</span>
        <span className="ml-auto text-text-secondary text-[10px] hover:text-text-primary">▲</span>
      </div>
    );
  }

  const height = mode === 'full' ? 'h-[85vh]' : 'h-52';

  return (
    <div className={`shrink-0 ${height} bg-surface-dark border-t border-border flex flex-col transition-all`}>
      <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-accent-green font-mono text-xs">{'>_'}</span>
          <span className="text-text-secondary text-[11px] font-mono">Terminal</span>
          <span className="text-[10px] text-text-secondary/60 font-mono">sandboxed · audit-logged</span>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'open' ? (
            <button onClick={() => setMode('full')} className="text-text-secondary hover:text-text-primary text-[11px] font-mono" title="Full screen">⤢</button>
          ) : (
            <button onClick={() => setMode('open')} className="text-text-secondary hover:text-text-primary text-[11px] font-mono" title="Restore">▢</button>
          )}
          <button onClick={() => setMode('collapsed')} className="text-text-secondary hover:text-text-primary text-[11px] font-mono" title="Collapse">▼</button>
        </div>
      </div>

      <div ref={outRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-2">
        {history.length === 0 && (
          <div className="text-text-secondary">No commands run yet. Try: <span className="text-accent-green">nmap -sV --top-ports 100 &lt;target&gt;</span></div>
        )}
        {history.map((h, i) => (
          <div key={i}>
            <div className="text-accent-blue">
              <span className="text-text-secondary">$</span> {h.cmd}
              <span className="text-text-secondary ml-2">[exit {h.exitCode}]</span>
            </div>
            {h.stdout && (
              <pre className="text-text-primary whitespace-pre-wrap mt-0.5 pl-2 border-l border-border">{h.stdout}</pre>
            )}
            {h.stderr && (
              <pre className="text-accent-red whitespace-pre-wrap mt-0.5 pl-2 border-l border-accent-red/30">{h.stderr}</pre>
            )}
          </div>
        ))}
        {running && <div className="text-text-secondary animate-pulse">running…</div>}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border shrink-0">
        <span className="text-accent-green shrink-0 font-mono text-xs">$</span>
        <input
          type="text"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="run a command (sandboxed, audit-logged)"
          className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder-text-secondary/40 font-mono text-xs"
          disabled={running}
        />
        <button
          onClick={run}
          disabled={running || !cmd.trim()}
          className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border border-accent-blue text-accent-blue hover:bg-accent-blue/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {running ? '...' : 'Run'}
        </button>
      </div>
    </div>
  );
}
