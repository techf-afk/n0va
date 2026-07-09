import { useState, useEffect } from 'react';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function countFindings(exec) {
  if (!exec.result) return { total: 0, new: 0, known: 0 };
  try {
    const r = typeof exec.result === 'string' ? JSON.parse(exec.result) : exec.result;
    const steps = r.results || r;
    let total = 0, newCount = 0, knownCount = 0;
    for (const step of steps) {
      const findings = step.findings || [];
      total += findings.length;
      newCount += findings.filter(f => f.isNew === true).length;
      knownCount += findings.filter(f => f.isNew === false).length;
    }
    return { total, new: newCount, known: knownCount };
  } catch { return { total: 0, new: 0, known: 0 }; }
}

export default function History() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [steps, setSteps] = useState([]);
  const [stepsLoading, setStepsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/executions')
      .then(r => r.json())
      .then(d => setExecutions(d.executions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setStepsLoading(true);
    try {
      const res = await fetch(`/api/executions/${id}/steps`);
      const d = await res.json();
      setSteps(d.steps || []);
    } catch { setSteps([]); }
    setStepsLoading(false);
  };

  const handleDownload = (exec) => {
    const data = typeof exec.result === 'string' ? exec.result : JSON.stringify(exec.result, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${exec.id}-${exec.created_at?.slice(0, 10) || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSarif = async (execId) => {
    try {
      const res = await fetch(`/api/executions/${execId}/sarif`);
      const sarif = await res.json();
      const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan-${execId}-sarif.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div>
      <h2 className="text-text-primary text-lg font-bold mb-6">History</h2>

      {loading && (
        <div className="text-text-secondary text-xs font-mono">Loading...</div>
      )}

      {!loading && executions.length === 0 && (
        <div className="bg-surface-secondary border border-border rounded p-8 text-center">
          <div className="text-text-secondary text-sm">No scan history</div>
          <div className="text-text-secondary text-xs mt-2">Run a scan to see results here</div>
        </div>
      )}

      <div className="space-y-2">
        {executions.map(exec => {
          const isExpanded = expanded === exec.id;
          const { total: findings, new: newFindings, known: knownFindings } = countFindings(exec);
          const statusColors = {
            completed: 'text-accent-green border-accent-green/30 bg-accent-green/10',
            running: 'text-accent-blue border-accent-blue/30 bg-accent-blue/10',
            failed: 'text-accent-red border-accent-red/30 bg-accent-red/10',
            pending: 'text-text-secondary border-border bg-surface-dark',
          };
          const sc = statusColors[exec.status] || statusColors.pending;

          return (
            <div key={exec.id} className="bg-surface-secondary border border-border rounded overflow-hidden">
              <button
                onClick={() => handleExpand(exec.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${sc}`}>
                    {exec.status}
                  </span>
                  <div className="min-w-0">
                    <div className="text-text-primary text-sm font-mono truncate">{exec.user_request}</div>
                    <div className="text-text-secondary text-[10px] mt-0.5 flex items-center gap-2">
                      <span>#{exec.id} — {timeAgo(exec.created_at)}</span>
                      {exec.plan?.pipeline && (
                        <span className="border border-border px-1 py-0.5 rounded text-[9px]">{exec.plan.pipeline}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-text-secondary text-[11px]">{findings} findings</span>
                  {newFindings > 0 && <span className="text-[10px] text-accent-green font-mono">{newFindings} new</span>}
                  <svg className={`w-3 h-3 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  {stepsLoading && <div className="text-text-secondary text-xs font-mono">Loading...</div>}

                  {!stepsLoading && steps.length === 0 && (
                    <div className="text-text-secondary text-xs font-mono">No step details</div>
                  )}

                  {steps.map((step, i) => {
                    let stepFindings = 0;
                    let stepNew = 0;
                    let stepKnown = 0;
                    if (step.outputs) {
                      const o = typeof step.outputs === 'string' ? JSON.parse(step.outputs) : step.outputs;
                      const f = o.findings || [];
                      stepFindings = f.length;
                      stepNew = f.filter(x => x.isNew === true).length;
                      stepKnown = f.filter(x => x.isNew === false).length;
                    }
                    const stepSc = {
                      completed: 'text-accent-green',
                      running: 'text-accent-blue',
                      failed: 'text-accent-red',
                    }[step.status] || 'text-text-secondary';

                    return (
                      <div key={step.id} className="flex items-center gap-3 text-xs font-mono">
                        <span className={`${stepSc}`}>
                          {step.status === 'completed' ? '[OK]' : step.status === 'failed' ? '[!!]' : '[--]'}
                        </span>
                        <span className="text-text-secondary">[{i + 1}]</span>
                        <span className="text-text-primary">{step.action}</span>
                        <span className="text-text-secondary">({stepFindings} findings{stepNew > 0 ? `, ${stepNew} new` : ''}{stepKnown > 0 ? `, ${stepKnown} known` : ''})</span>
                      </div>
                    );
                  })}

                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => handleDownloadSarif(exec.id)}
                      className="text-xs text-accent-blue underline font-mono"
                    >
                      ~$ download SARIF
                    </button>
                    <button
                      onClick={() => handleDownload(exec)}
                      className="text-xs text-accent-blue underline font-mono"
                    >
                      ~$ download full report
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
