import { useState } from 'react';
import { EgressBanner, RiskBadge } from './Safety.jsx';

export default function Analyze({ onStartScan }) {
  const [target, setTarget] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState([]);
  const [useGobuster, setUseGobuster] = useState(false);
  const [gobusterDone, setGobusterDone] = useState(false);
  const [useNuclei, setUseNuclei] = useState(false);
  const [nucleiDone, setNucleiDone] = useState(false);
  const [poc, setPoc] = useState(null);

  const addProgress = (msg) => {
    setProgress(p => [...p, { msg, ts: Date.now() }]);
  };

  const handleAnalyze = async (withGobuster = false, withNuclei = false) => {
    if (!target.trim()) return;
    setAnalyzing(true);
    setResult(null);
    setError(null);
    setPoc(null);
    if (!withGobuster && !withNuclei) setProgress([]);

    const isWebTarget = (result?.type === 'web-app' || result?.type === 'api');

    if (!withGobuster) {
      addProgress(`Parsing target: ${target.trim()}`);
    }

    try {
      await new Promise(r => setTimeout(r, 400));
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), useGobuster: !!withGobuster }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const raw = await res.json();
      const data = raw.result || raw;
      addProgress(`Classification: ${data.type} (${(data.confidence * 100).toFixed(0)}% confidence)`);

      if (data.type === 'web-app' || data.type === 'api') {
        addProgress('Probing web target...');
        await new Promise(r => setTimeout(r, 300));

        if (data.details?.statusCode) {
          addProgress(`  HTTP ${data.details.statusCode} — ${data.details.responseTime}ms`);
        }
        if (data.waf?.length) {
          addProgress(`  WAF detected: ${data.waf.join(', ')}`);
        }
        if (data.details?.openPorts?.length) {
          addProgress(`  Open ports: ${data.details.openPorts.map(p => `${p.port}/${p.service}`).join(', ')}`);
        }

        addProgress('Discovering endpoints...');
        await new Promise(r => setTimeout(r, 300));
        const endpoints = data.endpoints?.filter(e => e.status !== 'info') || [];
        if (endpoints.length) {
          endpoints.forEach(ep => {
            addProgress(`  ${ep.status} ${ep.path}`);
          });
        } else {
          addProgress('  No common endpoints exposed');
        }

        // Deep recon — whatweb
        addProgress('Running tech fingerprint (whatweb)...');
        await new Promise(r => setTimeout(r, 200));
        if (data.intelligence?.whatweb?.length) {
          addProgress(`  Technologies: ${data.intelligence.whatweb.slice(0, 8).join(', ')}`);
        } else {
          addProgress('  whatweb: not available or no tech detected');
        }

        // WAF
        if (data.intelligence?.wafw00f) {
          addProgress(`  WAF (confirmed): ${data.intelligence.wafw00f}`);
        }

        // Service versions
        if (data.intelligence?.serviceVersions?.length) {
          addProgress(`Service versions: ${data.intelligence.serviceVersions.map(s => `${s.port}/${s.service} (${s.version})`).join(', ')}`);
        }

        // Gobuster paths
        if (data.intelligence?.discoveredPaths?.length) {
          addProgress(`Discovered ${data.intelligence.discoveredPaths.length} hidden paths:`);
          data.intelligence.discoveredPaths.slice(0, 8).forEach(p => {
            addProgress(`  ${p.status} ${p.path}`);
          });
          if (data.intelligence.discoveredPaths.length > 8) {
            addProgress(`  ... and ${data.intelligence.discoveredPaths.length - 8} more`);
          }
        }
      }

      if (data.type === 'git-repo') {
        addProgress('Fetching repository info...');
        await new Promise(r => setTimeout(r, 300));
        if (data.details?.language) addProgress(`  Language: ${data.details.language}`);
        if (data.details?.stars != null) addProgress(`  Stars: ${data.details.stars}`);
        if (data.details?.topics?.length) addProgress(`  Topics: ${data.details.topics.slice(0, 5).join(', ')}`);

        addProgress('Scanning for dependency manifests...');
        await new Promise(r => setTimeout(r, 300));
        if (data.lockfiles?.length) {
          data.lockfiles.forEach(lf => addProgress(`  Found: ${lf.file} (${lf.type})`));
        } else {
          addProgress('  No lockfiles detected');
        }

        // Code structure analysis
        if (data.intelligence?.repoStructure) {
          const s = data.intelligence.repoStructure;
          addProgress('Analyzing code structure...');
          await new Promise(r => setTimeout(r, 200));
          if (s.dataStores?.length) addProgress(`  Data stores: ${s.dataStores.map(d => d.name).join(', ')}`);
          if (s.entryPoints?.length) addProgress(`  Entry points: ${s.entryPoints.join(', ')}`);
          if (s.apiSurface?.length) addProgress(`  API surface: ${s.apiSurface.join(', ')}`);
          if (s.configFiles?.length) addProgress(`  Config files: ${s.configFiles.join(', ')}`);
        }
      }

      if (data.techStack?.length) {
        addProgress(`Tech stack: ${data.techStack.map(t => t.name).join(', ')}`);
      }

      if (data.discoveredTools?.length) {
        addProgress(`Discovered ${data.discoveredTools.length} tools from GitHub/registries`);
        data.discoveredTools.slice(0, 3).forEach(t => {
          addProgress(`  ${t.name} (${t.stars.toLocaleString()} stars, ${t.source})`);
        });
      }

      addProgress('Analysis complete.');
      setResult(data);
      if (withGobuster) setGobusterDone(true);
      if (withNuclei) setNucleiDone(true);

      // PoC suggestions from the finished result
      try {
        const pocRes = await fetch('/api/poc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: data }),
        });
        if (pocRes.ok) {
          const pr = await pocRes.json();
          setPoc(pr.suggestions || []);
        }
      } catch {}
    } catch (e) {
      if (!withGobuster) addProgress(`[!!] Error: ${e.message}`);
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const getConfidenceColor = (c) => {
    if (c >= 0.8) return 'text-accent-green';
    if (c >= 0.5) return 'text-accent-orange';
    return 'text-accent-red';
  };

  return (
    <div>
      <EgressBanner />

      <h2 className="text-lg font-bold text-text-primary mb-1">Target Analysis</h2>
      <p className="text-sm text-text-secondary mb-6">
        Enter a URL, GitHub repo, or local path to analyze before scanning.
      </p>

      {/* Input */}
      <div className="bg-surface-secondary border border-border rounded p-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-sm font-mono shrink-0">$ analyze</span>
          <input
            type="text"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !analyzing && handleAnalyze()}
            placeholder="https://example.com or owner/repo or /local/path"
            className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm font-mono placeholder-text-secondary/40"
            disabled={analyzing}
          />
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !target.trim()}
            className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider border border-accent-blue text-accent-blue hover:bg-accent-blue/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {analyzing ? '...' : 'Run'}
          </button>
        </div>
      </div>

      {/* Progress log */}
      {progress.length > 0 && (
        <div className="bg-surface-dark border border-border rounded p-4 mb-6 font-mono text-xs leading-relaxed max-h-64 overflow-y-auto">
          {progress.map((p, i) => (
            <div key={i} className={`
              ${p.msg.startsWith('  ') ? 'pl-4 text-text-secondary' : 'text-text-primary'}
              ${p.msg.includes('[!!]') ? 'text-accent-red' : ''}
              ${p.msg === 'Analysis complete.' ? 'text-accent-green' : ''}
            `}>
              {p.msg.startsWith('  ') ? p.msg : `[${String(i + 1).padStart(2, '0')}] ${p.msg}`}
            </div>
          ))}
          {analyzing && (
            <span className="inline-block w-2 h-4 bg-text-primary ml-1 animate-pulse" />
          )}
        </div>
      )}

      {/* Gobuster confirmation prompt */}
      {result && !analyzing && (result.type === 'web-app' || result.type === 'api') && !gobusterDone && (
        <div className="bg-accent-orange/5 border border-accent-orange/30 rounded p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-accent-orange text-sm mt-0.5">!</span>
            <div className="flex-1">
              <div className="text-text-primary text-xs font-bold mb-1 font-mono">
                Run path discovery with gobuster?
              </div>
              <div className="text-text-secondary text-[11px] mb-3 leading-relaxed font-mono">
                This sends many GET requests to discover hidden paths (admin panels, config files, APIs).
                Visible in the target's logs/WAF and can expose your real IP. Only use on targets you own or
                are authorized to test. To avoid attribution, route scans through a VPN or proxy
                (set HTTP_PROXY / ALL_PROXY before starting the backend).
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAnalyze(true)}
                  disabled={analyzing}
                  className="px-3 py-1.5 rounded text-xs font-mono border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 disabled:opacity-40 transition-colors"
                >
                  {analyzing ? 'running...' : 'Yes, probe hidden paths'}
                </button>
                <button
                  onClick={() => setGobusterDone(true)}
                  disabled={analyzing}
                  className="px-3 py-1.5 rounded text-xs font-mono text-text-secondary border border-border hover:bg-surface-dark transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nuclei confirmation prompt */}
      {result && !analyzing && (result.type === 'web-app' || result.type === 'api') && !nucleiDone && (
        <div className="bg-red-400/5 border border-red-400/30 rounded p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-sm mt-0.5">!</span>
            <div className="flex-1">
              <div className="text-text-primary text-xs font-bold mb-1 font-mono">
                Run nuclei vulnerability probe?
              </div>
              <div className="text-text-secondary text-[11px] mb-3 leading-relaxed font-mono">
                Template-based scanner that actively probes for known CVEs. This sends many requests,
                is clearly visible in the target's logs/WAF, and can expose your real IP. Only use on
                targets you own or are authorized to test. Route through a VPN/proxy
                (set HTTP_PROXY / ALL_PROXY before starting the backend).
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAnalyze(false, true)}
                  disabled={analyzing}
                  className="px-3 py-1.5 rounded text-xs font-mono border border-red-400/40 text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                >
                  {analyzing ? 'running...' : 'Yes, probe with nuclei'}
                </button>
                <button
                  onClick={() => setNucleiDone(true)}
                  disabled={analyzing}
                  className="px-3 py-1.5 rounded text-xs font-mono text-text-secondary border border-border hover:bg-surface-dark transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !analyzing && (
        <div className="space-y-4">
          {/* Target Classification */}
          <Section title="Classification">
            <div className="grid grid-cols-2 gap-4">
              <Info label="Type" value={result.type} />
              <Info label="Subtype" value={result.subtype || '—'} />
              <Info label="Confidence" value={`${(result.confidence * 100).toFixed(0)}%`} className={getConfidenceColor(result.confidence)} />
              <Info label="Input" value={result.input} />
            </div>
            {/* Confidence breakdown */}
            {result.confidenceBreakdown?.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 font-mono">Evidence</div>
                <div className="space-y-1">
                  {result.confidenceBreakdown.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-text-secondary truncate mr-2">{c.evidence}</span>
                      <span className="shrink-0">
                        <span className={c.points > 0 ? 'text-accent-green' : 'text-text-secondary'}>+{c.points}</span>
                        <span className="text-text-secondary ml-1">= {Math.round(c.total * 100)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Open Ports */}
          {result.details?.openPorts?.length > 0 && (
            <Section title={`Open Ports (${result.details.openPorts.length})`}>
              <div className="space-y-1">
                {result.details.openPorts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-accent-green w-8">{p.port}</span>
                    <span className="text-text-primary">{p.service}</span>
                    <span className="text-text-secondary text-[10px] uppercase tracking-wider">{p.category}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* WAF */}
          {result.waf?.length > 0 && (
            <Section title="Web Application Firewall">
              <div className="flex flex-wrap gap-2">
                {result.waf.map((w, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-accent-orange/30 text-accent-orange bg-accent-orange/5 uppercase tracking-wider">
                    {w}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Tech Stack */}
          {result.techStack?.length > 0 && (
            <Section title={`Tech Stack (${result.techStack.length})`}>
              <div className="flex flex-wrap gap-2">
                {result.techStack.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-border text-text-primary bg-surface-secondary/50">
                    {t.name}
                    {t.source && <span className="text-text-secondary ml-1">[{t.source}]</span>}
                    {t.category && <span className="text-text-secondary ml-1">({t.category})</span>}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Target Intelligence — whatweb deep tech */}
          {result.intelligence?.whatweb?.length > 0 && (
            <Section title={`Deep Tech Fingerprint (whatweb — ${result.intelligence.whatweb.length})`}>
              <div className="flex flex-wrap gap-2">
                {result.intelligence.whatweb.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-accent-blue/30 text-accent-blue bg-accent-blue/5">
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Target Intelligence — service versions */}
          {result.intelligence?.serviceVersions?.length > 0 && (
            <Section title={`Service Versions (nmap — ${result.intelligence.serviceVersions.length})`}>
              <div className="space-y-1">
                {result.intelligence.serviceVersions.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-accent-green w-10">{s.port}</span>
                    <span className="text-text-primary">{s.service}</span>
                    <span className="text-text-secondary text-[11px]">{s.version}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Target Intelligence — discovered paths */}
          {result.intelligence?.discoveredPaths?.length > 0 && (
            <Section title={`Discovered Paths (gobuster — ${result.intelligence.discoveredPaths.length})`}>
              <div className="space-y-1">
                {result.intelligence.discoveredPaths.slice(0, 30).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-mono">
                    <span className={`
                      w-8 text-right shrink-0
                      ${p.status < 300 ? 'text-accent-green' : p.status < 400 ? 'text-accent-orange' : 'text-accent-red'}
                    `}>
                      {p.status}
                    </span>
                    <span className="text-text-primary">{p.path}</span>
                  </div>
                ))}
                {result.intelligence.discoveredPaths.length > 30 && (
                  <div className="text-[10px] text-text-secondary font-mono">+{result.intelligence.discoveredPaths.length - 30} more</div>
                )}
              </div>
            </Section>
          )}

          {/* Repo structure — data stores, entry points, API surface, config files */}
          {result.intelligence?.repoStructure && (
            <Section title="Code Structure Analysis">
              <div className="space-y-3">
                {result.intelligence.repoStructure.dataStores?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 font-mono">Data Stores</div>
                    <div className="flex flex-wrap gap-2">
                      {result.intelligence.repoStructure.dataStores.map((d, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-accent-blue/30 text-accent-blue bg-accent-blue/5">
                          {d.name}
                          {d.source && <span className="text-text-secondary ml-1">({d.source})</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.intelligence.repoStructure.entryPoints?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 font-mono">Entry Points</div>
                    <div className="flex flex-wrap gap-2">
                      {result.intelligence.repoStructure.entryPoints.map((e, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-accent-green/30 text-accent-green bg-accent-green/5">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.intelligence.repoStructure.apiSurface?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 font-mono">API Surface</div>
                    <div className="flex flex-wrap gap-2">
                      {result.intelligence.repoStructure.apiSurface.map((a, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-accent-orange/30 text-accent-orange bg-accent-orange/5">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.intelligence.repoStructure.configFiles?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 font-mono">Config Files</div>
                    <div className="flex flex-wrap gap-2">
                      {result.intelligence.repoStructure.configFiles.map((c, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-border text-text-primary bg-surface-dark">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Endpoints */}
          {result.endpoints?.filter(e => e.status !== 'info').length > 0 && (
            <Section title={`Discovered Endpoints (${result.endpoints.filter(e => e.status !== 'info').length})`}>
              <div className="space-y-1">
                {result.endpoints.filter(e => e.status !== 'info').map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-mono">
                    <span className={`
                      w-8 text-right shrink-0
                      ${ep.status < 300 ? 'text-accent-green' : ep.status < 400 ? 'text-accent-orange' : 'text-accent-red'}
                    `}>
                      {ep.status}
                    </span>
                    <span className="text-text-primary">{ep.path}</span>
                    <span className="text-text-secondary text-[10px] truncate">{ep.size}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Endpoint info messages */}
          {result.endpoints?.filter(e => e.status === 'info').length > 0 && (
            <Section title="Recon Tips">
              <div className="space-y-1">
                {result.endpoints.filter(e => e.status === 'info').map((ep, i) => (
                  <div key={i} className="text-xs text-text-secondary">
                    {ep.path}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Lockfiles */}
          {result.lockfiles?.length > 0 && (
            <Section title="Dependency Manifests">
              <div className="space-y-1">
                {result.lockfiles.map((lf, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-accent-blue">{lf.file}</span>
                    <span className="text-text-secondary">→ {lf.tools.join(', ')}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Discovered Tools from GitHub */}
          {result.discoveredTools?.length > 0 && (
            <Section title={`Discovered from GitHub/Registries (${result.discoveredTools.length})`}>
              {result.toolDiscoverySummary && (
                <div className="text-xs text-text-secondary mb-4 leading-relaxed">
                  {result.toolDiscoverySummary}
                </div>
              )}
              <div className="space-y-2">
                {result.discoveredTools.map((t, i) => (
                  <a key={i} href={t.url} target="_blank" rel="noopener noreferrer"
                     className="block bg-surface-dark border border-border rounded p-3 hover:border-accent-blue/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-accent-blue underline">{t.name}</span>
                      <span className="text-[10px] text-text-secondary">
                        {t.stars > 0 ? `⭐${t.stars.toLocaleString()} stars` : '📦 new'}
                        <span className="ml-2 uppercase">[{t.source}]</span>
                      </span>
                    </div>
                    {t.description && (
                      <div className="text-[11px] text-text-secondary leading-relaxed">{t.description}</div>
                    )}
                    {t.topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.topics.slice(0, 4).map((topic, j) => (
                          <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-secondary text-text-secondary">
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Recommended Tools */}
          {result.recommendedTools?.length > 0 && (
            <Section title="Recommended Pipeline">
              <div className="flex flex-wrap gap-2">
                {result.recommendedTools.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded border border-accent-blue/30 text-accent-blue bg-accent-blue/5 uppercase tracking-wider">
                    {t}
                  </span>
                ))}
              </div>
              <button
                onClick={() => onStartScan?.(result)}
                className="mt-4 w-full py-2.5 rounded text-xs font-bold uppercase tracking-wider border border-accent-blue text-accent-blue hover:bg-accent-blue/10 transition-colors"
              >
                Start Scan with These Tools
              </button>
            </Section>
          )}

          {/* PoC command suggestions */}
          {poc?.length > 0 && (
            <Section title={`Exploit / PoC Commands (${poc.length})`}>
              <div className="space-y-4">
                {poc.map((g, i) => (
                  <div key={i}>
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1.5 font-mono">
                      {g.source}
                    </div>
                    <div className="space-y-2">
                      {g.commands.map((c, j) => (
                        <div key={j} className="bg-surface-dark border border-border rounded p-2.5">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[11px] text-text-primary font-mono">{c.label}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {c.unavailable && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded border border-accent-orange/40 text-accent-orange bg-accent-orange/10 uppercase tracking-wider font-mono">not installed</span>
                              )}
                              <RiskBadge level={c.risk} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-[11px] text-accent-green font-mono bg-black/30 rounded px-2 py-1 overflow-x-auto whitespace-pre">
                              {c.cmd}
                            </code>
                            <button
                              onClick={() => navigator.clipboard?.writeText(c.cmd)}
                              className="shrink-0 text-[10px] px-2 py-1 rounded border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
                              title="Copy to clipboard"
                            >
                              copy
                            </button>
                          </div>
                          {c.unavailable && (
                            <div className="text-[10px] text-accent-orange mt-1 font-mono whitespace-pre-line">
                              {c.note}
                            </div>
                          )}
                          <div className="text-[10px] text-text-secondary mt-1 font-mono">
                            Or run it in the terminal below ↓
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Git details */}
          {result.details?.language && (
            <Section title="Repository Details">
              <div className="grid grid-cols-2 gap-4">
                {result.details.language && <Info label="Language" value={result.details.language} />}
                {result.details.stars != null && <Info label="Stars" value={result.details.stars.toLocaleString()} />}
                {result.details.description && <div className="col-span-2"><Info label="Description" value={result.details.description} /></div>}
                {result.details.topics?.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider block mb-1">Topics</span>
                    <div className="flex flex-wrap gap-1">
                      {result.details.topics.map((t, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary text-text-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Raw error */}
          {error && (
            <div className="bg-accent-red/5 border border-accent-red/30 rounded p-4 text-xs text-accent-red font-mono">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-surface-secondary border border-border rounded">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function Info({ label, value, className = '' }) {
  return (
    <div>
      <span className="text-[10px] text-text-secondary uppercase tracking-wider block mb-0.5">{label}</span>
      <span className={`text-sm text-text-primary font-mono ${className}`}>{value}</span>
    </div>
  );
}
