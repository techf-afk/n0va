export default function Sidebar({ tabs, activeTab, onTabChange, onBackToLanding, open, onToggle, stats }) {
  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-4 left-4 z-50 bg-surface-secondary border border-border rounded p-2 text-text-primary"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Overlay for mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-56 bg-surface-dark border-r border-border
        flex flex-col
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand */}
        <div className="p-6 border-b border-border">
          <button onClick={onBackToLanding} className="text-left hover:opacity-80 transition-opacity">
            <div className="text-text-primary text-sm font-bold">n0va</div>
            <div className="text-text-secondary text-[10px] mt-1">security orchestrator</div>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm
                transition-colors font-mono
                ${activeTab === tab.key
                  ? 'bg-surface-secondary text-text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                }
              `}
            >
              <span className={`
                ${activeTab === tab.key ? 'text-accent-blue' : 'text-text-secondary'}
              `}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          {stats && (
            <div className="text-[10px] text-text-secondary leading-relaxed">
              <div>{stats.total} tool{stats.total !== 1 ? 's' : ''} registered</div>
              <div className="mt-1 flex gap-2">
                {stats.byType?.cli > 0 && <span className="text-accent-blue">CLI: {stats.byType.cli}</span>}
                {stats.byType?.api > 0 && <span className="text-accent-green">API: {stats.byType.api}</span>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
