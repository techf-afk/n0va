import { useState, useEffect, useRef } from 'react';
import { EgressBanner, RiskBadge, RiskWarning } from './Safety.jsx';

function Chevron({ open }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SeverityBadge({ severity }) {
  const s = severity || 'INFO';
  const colors = {
    ERROR: 'bg-accent-red/20 text-accent-red border-accent-red/30',
    WARNING: 'bg-accent-orange/20 text-accent-orange border-accent-orange/30',
    INFO: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${colors[s] || colors.INFO}`}>
      {s}
    </span>
  );
}

function CodeBlock({ code, startLine }) {
  if (!code) return null;
  const lines = code.split('\n');
  return (
    <pre className="bg-surface-dark rounded p-3 text-xs font-mono overflow-x-auto border border-border mt-2">
      {lines.map((line, i) => (
        <div key={i} className="flex hover:bg-surface-secondary/50">
          <span className="text-text-secondary/40 w-8 shrink-0 text-right mr-3 select-none">{startLine + i}</span>
          <span className="text-text-primary whitespace-pre">{line}</span>
        </div>
      ))}
    </pre>
  );
}

function BaselineBadge({ isNew }) {
  if (isNew === undefined) return null;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
      isNew
        ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
        : 'bg-text-secondary/10 text-text-secondary border-text-secondary/20'
    }`}>
      {isNew ? 'NEW' : 'KNOWN'}
    </span>
  );
}

function FindingCard({ finding, defaultOpen, reposDir, showNewOnly }) {
  const [open, setOpen] = useState(defaultOpen);
  const [code, setCode] = useState(null);
  const [codeStart, setCodeStart] = useState(1);
  const [loadingCode, setLoadingCode] = useState(false);

  const fullPath = finding.path || finding.file || finding.File || finding.Location || '';
  const relativePath = reposDir ? fullPath.replace(reposDir.replace(/\/$/, '') + '/', '') : fullPath;
  const line = finding.start?.line || finding.line || '';
  const sev = finding.extra?.severity || finding.severity || 'INFO';
  const vulnClass = finding.extra?.metadata?.vulnerability_class?.[0] || finding.check_id?.split('.').slice(-1)[0] || '';
  const isNew = finding.isNew;

  // Filter out known findings when showNewOnly is active
  if (showNewOnly && isNew === false) return null;

  useEffect(() => {
    if (!open || code !== null || !fullPath || !line) return;
    setLoadingCode(true);
    fetch(`/api/code?path=${encodeURIComponent(fullPath)}&line=${line}`)
      .then(r => r.json())
      .then(d => { if (d.lines) { setCode(d.lines); setCodeStart(d.startLine); } })
      .catch(() => {})
      .finally(() => setLoadingCode(false));
  }, [open, fullPath, line]);

  return (
    <div className="border border-border rounded overflow-hidden bg-surface-dark/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-secondary/50 transition-colors"
      >
        <span className="mt-0.5 shrink-0 text-text-secondary">
          <Chevron open={open} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge severity={sev} />
            <BaselineBadge isNew={isNew} />
            {vulnClass && (
              <span className="text-[10px] text-text-secondary font-mono truncate">{vulnClass}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-primary font-mono">{relativePath}</span>
            {line && <span className="text-text-secondary shrink-0">:{line}</span>}
          </div>
          {!open && (
            <div className="text-[11px] text-text-secondary mt-1 truncate">
              {finding.extra?.message || finding.message || ''}
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <div className="text-xs text-text-primary leading-relaxed">
            {finding.extra?.message || finding.message || ''}
          </div>
          {loadingCode && <div className="text-xs text-text-secondary">Loading code...</div>}
          {code && <CodeBlock code={code} startLine={codeStart} />}
          {finding.Match && (
            <div className="text-xs bg-accent-red/10 border border-accent-red/20 rounded p-2">
              <span className="text-text-secondary">Matched:</span>
              <code className="ml-1 text-accent-red font-mono">{finding.Match}</code>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {finding.extra?.metadata?.cwe?.map((c, i) => (
              <span key={i} className="text-text-secondary bg-surface-dark px-1.5 py-0.5 rounded border border-border">{c}</span>
            ))}
            {finding.extra?.metadata?.references?.[0] && (
              <a href={finding.extra.metadata.references[0]} target="_blank" rel="noopener noreferrer"
                 className="text-accent-blue underline px-1.5 py-0.5 rounded">
                Reference
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index, reposDir }) {
  const [open, setOpen] = useState(true);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const findings = step.findings || [];
  const semResults = step.results || [];
  const allIssues = [...semResults, ...findings];
  const total = allIssues.length;
  const newCount = allIssues.filter(i => i.isNew === true).length;
  const knownCount = allIssues.filter(i => i.isNew === false).length;
  const toolName = step.tool || step.action || 'clone';

  const bySeverity = {};
  for (const issue of allIssues) {
    const s = issue.extra?.severity || issue.severity || 'INFO';
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  }

  const statusIcon = total === 0 ? '[OK]' : '[!!]';
  const statusColor = total === 0 ? 'text-accent-green' : 'text-accent-red';
  const showFilter = newCount + knownCount > 0;

  return (
    <div className="border border-border rounded overflow-hidden bg-surface-dark">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`${statusColor} text-xs font-mono`}>{statusIcon}</span>
          <span className="text-text-secondary text-xs font-mono">[{index + 1}]</span>
          <span className="text-text-primary text-sm font-bold">{toolName}</span>
          {total > 0 && (
            <span className="text-text-secondary text-xs">({total} finding{total !== 1 ? 's' : ''})</span>
          )}
          {newCount > 0 && (
            <span className="text-[10px] text-accent-green font-mono">{newCount} new</span>
          )}
          {knownCount > 0 && (
            <span className="text-[10px] text-text-secondary font-mono">{knownCount} known</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bySeverity.ERROR > 0 && <span className="text-[10px] bg-accent-red/20 text-accent-red px-1.5 py-0.5 rounded font-bold">{bySeverity.ERROR}</span>}
          {bySeverity.WARNING > 0 && <span className="text-[10px] bg-accent-orange/20 text-accent-orange px-1.5 py-0.5 rounded font-bold">{bySeverity.WARNING}</span>}
          {bySeverity.INFO > 0 && <span className="text-[10px] bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded">{bySeverity.INFO}</span>}
          <span className="text-text-secondary"><Chevron open={open} /></span>
        </div>
      </button>
      {open && total > 0 && (
        <div className="px-4 pb-3 space-y-1.5 max-h-[500px] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-text-secondary font-mono">
              {showNewOnly ? 'Showing new only' : `${allIssues.length} findings`}
            </div>
            {showFilter && (
              <button
                onClick={() => setShowNewOnly(!showNewOnly)}
                className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                  showNewOnly
                    ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
                    : 'text-text-secondary border-border hover:border-text-secondary/30'
                }`}
              >
                {showNewOnly ? 'show all' : 'new only'}
              </button>
            )}
          </div>
          {allIssues.map((issue, j) => (
            <FindingCard key={j} finding={issue} defaultOpen={j < 3} reposDir={reposDir} showNewOnly={showNewOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChainVisualization({ steps, wsLog }) {
  const getStepStatus = (actionName) => {
    const matching = wsLog.filter(w => w.action === actionName || w.message?.includes(actionName));
    if (matching.some(w => w.type === 'step:complete')) return 'done';
    if (matching.some(w => w.type === 'step:start' || w.type === 'step:progress')) return 'running';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((step, i) => {
        const status = getStepStatus(step);
        const statusColors = {
          done: 'text-accent-green border-accent-green/50 bg-accent-green/10',
          running: 'text-accent-blue border-accent-blue/50 bg-accent-blue/10',
          pending: 'text-text-secondary border-border bg-surface-dark',
        };
        const c = statusColors[status] || statusColors.pending;
        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-text-secondary text-xs">→</span>}
            <span className={`text-[10px] px-2 py-1 rounded border font-mono uppercase tracking-wider ${c}`}>
              {status === 'running' && <span className="cursor-blink mr-1">▶</span>}
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LiveLog({ wsLog }) {
  const logEndRef = useRef(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [wsLog]);

  if (wsLog.length === 0) return null;

  return (
    <div className="bg-surface-dark border border-border rounded p-4 font-mono text-xs">
      <div className="text-text-secondary text-[10px] mb-2 uppercase tracking-wider">Live Log</div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {wsLog.map((entry, i) => {
          if (entry.type === 'step:progress') return <div key={i} className="text-accent-blue">{entry.message}</div>;
          if (entry.type === 'step:start') return <div key={i} className="text-accent-orange">$ {entry.action}...</div>;
          if (entry.type === 'step:complete') return <div key={i} className="text-accent-green">[OK] {entry.action}</div>;
          if (entry.type === 'execution:complete') return <div key={i} className="text-accent-green font-bold">[DONE] Scan complete</div>;
          if (entry.type === 'execution:error') return <div key={i} className="text-accent-red">[ERR] {entry.error}</div>;
          return null;
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export default function Executor({ tools, initialTarget, onClearTarget }) {
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [wsLog, setWsLog] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [reposDir, setReposDir] = useState('');
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [risks, setRisks] = useState({});
  const wsRef = useRef(null);
  const prevTargetRef = useRef(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => setReposDir(d.reposDir || '')).catch(() => {});
    fetch('/api/pipelines').then(r => r.json()).then(d => {
      const p = d.pipelines || [];
      setPipelines(p);
      if (p.length > 0) setSelectedPipeline(p[0].name);
    }).catch(() => {});
    fetch('/api/tools/risk').then(r => r.json()).then(d => setRisks(d.risks || {})).catch(() => {});
  }, []);

  // Sync initialTarget from Analyze tab
  useEffect(() => {
    if (!initialTarget || prevTargetRef.current === initialTarget.input) return;
    prevTargetRef.current = initialTarget.input;

    let req;
    if (initialTarget.type === 'git-repo') {
      const tools = initialTarget.recommendedTools?.slice(0, 3).join(', ') || 'gitleaks, trufflehog, semgrep';
      req = `Scan ${initialTarget.input} with ${tools}`;
    } else if (initialTarget.type === 'web-app' || initialTarget.type === 'api') {
      req = `Scan ${initialTarget.input} for vulnerabilities. Detected: ${initialTarget.techStack?.map(t => t.name).join(', ') || 'unknown'}. WAF: ${initialTarget.waf?.join(', ') || 'none'}`;
    } else {
      req = `Scan ${initialTarget.input}`;
    }
    setRequest(req);
  }, [initialTarget]);

  useEffect(() => {
    const { hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const wsPort = isLocal ? '3001' : window.location.port;
    const wsHost = isLocal ? `${hostname}:${wsPort}` : window.location.host;
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsHost}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try { setWsLog(prev => [...prev, JSON.parse(event.data)]); } catch {}
    };
    return () => ws.close();
  }, []);

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!request.trim()) return;
    setLoading(true);
    setResult(null);
    setWsLog([]);
    try {
      const body = { request: request.trim() };
      if (selectedPipeline) body.pipeline = selectedPipeline;
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setResult(await res.json());
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-report-${result.executionId || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSarif = async () => {
    if (!result || !result.executionId) return;
    try {
      const res = await fetch(`/api/executions/${result.executionId}/sarif`);
      const sarif = await res.json();
      const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan-${result.executionId}-sarif.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const toolsByName = tools.reduce((acc, t) => { acc[t.name] = t; return acc; }, {});

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-text-primary text-lg font-bold">Scan</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-accent-green' : 'bg-accent-red'}`} />
          <span className="text-text-secondary text-[11px]">{wsConnected ? 'connected' : 'disconnected'}</span>
        </div>
      </div>

      <EgressBanner />

      {/* Analysis banner */}
      {initialTarget && (
        <div className="bg-accent-blue/5 border border-accent-blue/20 rounded p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-accent-blue font-bold uppercase tracking-wider">Analyzed:</span>
            <span className="text-text-primary font-mono">{initialTarget.input}</span>
            <span className="text-text-secondary">—</span>
            <span className="text-text-secondary">{initialTarget.type} ({initialTarget.techStack?.map(t => t.name).slice(0, 3).join(', ') || 'unknown'})</span>
          </div>
          <button
            onClick={() => { setRequest(''); setResult(null); onClearTarget?.(); }}
            className="text-[10px] text-text-secondary hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            clear
          </button>
        </div>
      )}

      {/* Pipeline selector */}
      <div className="bg-surface-secondary border border-border rounded p-5 mb-6">
        <label className="text-text-secondary text-xs block mb-2 font-mono">Pipeline</label>
        <div className="flex gap-2 flex-wrap">
          {pipelines.map(p => (
            <button
              key={p.name}
              onClick={() => setSelectedPipeline(p.name)}
              className={`text-[11px] px-3 py-1.5 rounded border font-mono transition-colors ${
                selectedPipeline === p.name
                  ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                  : 'bg-surface-dark text-text-secondary border-border hover:border-text-secondary/30'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        {selectedPipeline && (
          <div className="text-[11px] text-text-secondary mt-2 font-mono">
            {pipelines.find(p => p.name === selectedPipeline)?.description || ''}
          </div>
        )}
        {selectedPipeline && (() => {
          const steps = Array.isArray(pipelines.find(p => p.name === selectedPipeline)?.steps) ? pipelines.find(p => p.name === selectedPipeline).steps : [];
          const risky = steps.filter(s => risks[s.adapter] && risks[s.adapter] !== 'passive');
          if (risky.length === 0) return null;
          return (
            <div className="mt-3 space-y-1">
              {risky.map(s => (
                <div key={s.id || s.adapter} className="flex items-center gap-2">
                  <RiskBadge level={risks[s.adapter]} />
                  <span className="text-[11px] text-text-secondary font-mono">{s.adapter}</span>
                  <RiskWarning level={risks[s.adapter]} />
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Input */}
      <div className="bg-surface-secondary border border-border rounded p-5 mb-6">
        {tools.length === 0 ? (
          <div className="border border-accent-orange/30 bg-accent-orange/10 rounded p-4 text-xs text-accent-orange font-mono">
            No tools available. Add tools in the "Tools" section first.
          </div>
        ) : (
          <form onSubmit={handleExecute}>
            <label className="text-text-secondary text-xs block mb-2 font-mono">
              ~$ scan &lt;repo&gt; [options]
            </label>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={`Examples:\n  Scan https://github.com/expressjs/express for vulnerabilities\n  Scan https://gitlab.com/org/project\n  Check ~/my-project for issues`}
              rows={3}
              className="w-full bg-surface border border-border rounded-md px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue resize-none font-mono text-sm"
              disabled={loading}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-1.5">
                {['gitleaks', 'trufflehog', 'semgrep'].filter(n => toolsByName[n]).map(n => (
                  <span key={n} className="text-[10px] text-text-secondary bg-surface-dark px-2 py-0.5 rounded border border-border font-mono">{n}</span>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || !request.trim()}
                className="bg-surface-secondary text-text-primary px-5 py-2.5 rounded hover:bg-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-sm border border-border"
              >
                {loading ? 'scanning...' : '$ run scan'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Pipeline visualization */}
      {loading && wsLog.length > 0 && (
        <div className="bg-surface-secondary border border-border rounded p-4 mb-4">
          <div className="text-text-secondary text-[10px] mb-2 uppercase tracking-wider font-mono">
            Pipeline: {selectedPipeline || 'default'}
          </div>
          <ChainVisualization
            steps={(() => {
              const st = Array.isArray(pipelines.find(p => p.name === selectedPipeline)?.steps) ? pipelines.find(p => p.name === selectedPipeline).steps : [];
              return st.length > 0 ? st.map(s => s.id || s.adapter || 'step') : ['clone', 'gitleaks', 'trufflehog', 'semgrep', 'report'];
            })()}
            wsLog={wsLog}
          />
        </div>
      )}

      {/* Live log */}
      <LiveLog wsLog={wsLog} />

      {/* Results */}
      {result && (
        <div className={`border rounded mt-4 ${result.success ? 'border-accent-green/30' : 'border-accent-red/30'}`}>
          <div className="bg-surface-secondary rounded p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-text-primary text-sm font-bold">
                  {result.success ? '[RESULT]' : '[ERROR]'}
                </h3>
                <span className="text-text-secondary text-xs font-mono">
                  {result.executionId ? `#${result.executionId}` : ''}
                </span>
                {selectedPipeline && (
                  <span className="text-text-secondary text-[10px] font-mono border border-border px-1.5 py-0.5 rounded">
                    {selectedPipeline}
                  </span>
                )}
              </div>
              {result.success && (
                <div className="flex gap-2">
                  <button onClick={handleSaveSarif}
                    className="text-[11px] px-3 py-1.5 bg-surface-dark hover:bg-border text-text-secondary rounded transition-colors font-mono border border-border">
                    ~$ download SARIF
                  </button>
                  <button onClick={handleSaveReport}
                    className="text-[11px] px-3 py-1.5 bg-surface-dark hover:bg-border text-text-secondary rounded transition-colors font-mono border border-border">
                    ~$ download report
                  </button>
                </div>
              )}
            </div>

            {result.success ? (
              <div className="space-y-2">
                {result.results?.map((step, i) => (
                  <StepCard key={i} step={step} index={i} reposDir={reposDir} />
                ))}
              </div>
            ) : (
              <div className="border border-accent-red/30 bg-accent-red/10 rounded p-3 text-xs text-accent-red font-mono">
                {result.error || 'Unknown error'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
