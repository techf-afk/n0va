export default function Landing({ onEnter, stats }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-content">
        {/* Terminal Hero */}
        <div className="bg-surface-dark rounded-[4px] overflow-hidden border border-border">
          {/* Terminal header dots */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
            <span className="text-text-secondary text-xs ml-2">n0va — v0.1.0</span>
          </div>

          {/* Terminal content */}
          <div className="px-6 py-8 md:px-8 md:py-12">
            <pre className="text-accent-green text-sm md:text-base leading-relaxed mb-6">
              <span className="text-text-secondary">  _  _   ___   _   _   ___  </span>
              <span className="text-text-secondary"> | \| | / _ \ | \ | | / _ \ </span>
              <span className="text-text-secondary"> | .` |( (_) )|  \| || (_) )</span>
              <span className="text-text-secondary"> |_|\_| \___/ |_|\_| \___/ </span>
            </pre>

            <div className="space-y-2 text-xs md:text-sm">
              <div>
                <span className="text-accent-green">guddu@n0va</span>
                <span className="text-text-secondary">:</span>
                <span className="text-accent-blue">~</span>
                <span className="text-text-secondary">$ </span>
                <span className="text-text-primary">./orchestrator --init</span>
              </div>
              <div className="text-text-secondary">
                [INFO]  Initializing security pipeline...
              </div>
              <div className="text-text-secondary">
                [INFO]  Scanning tools: gitleaks, trufflehog, semgrep
              </div>
              {stats && (
                <div className="text-accent-green">
                  [OK]    {stats.total} tool{stats.total !== 1 ? 's' : ''} registered
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-accent-green">guddu@n0va</span>
                <span className="text-text-secondary">:</span>
                <span className="text-accent-blue">~</span>
                <span className="text-text-secondary">$ </span>
                <span className="text-text-primary">_</span>
                <span className="cursor-blink text-text-primary">|</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center mt-8 space-y-2">
          <h1 className="text-text-primary text-xl md:text-2xl font-bold">
            Automated Security Pipeline
          </h1>
          <p className="text-text-secondary text-xs md:text-sm">
            Clone. Scan. Report. One command.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={onEnter}
            className="bg-surface-secondary text-text-primary px-6 py-3 rounded hover:bg-border transition-colors font-mono text-sm"
          >
            ~$ ./dashboard
          </button>
        </div>

        {/* Tool indicators */}
        <div className="mt-12 flex justify-center gap-4 text-xs text-text-secondary">
          <span className="text-accent-blue">[gitleaks]</span>
          <span className="text-text-secondary">|</span>
          <span className="text-accent-green">[trufflehog]</span>
          <span className="text-text-secondary">|</span>
          <span className="text-accent-orange">[semgrep]</span>
        </div>
      </div>
    </div>
  );
}
