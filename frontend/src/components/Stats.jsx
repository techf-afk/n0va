export default function Stats({ stats }) {
  if (!stats) return null;
  const types = [
    { key: 'cli', label: 'CLI', color: 'text-accent-blue' },
    { key: 'api', label: 'API', color: 'text-accent-green' },
    { key: 'library', label: 'Lib', color: 'text-accent-orange' },
    { key: 'service', label: 'Svc', color: 'text-text-secondary' },
    { key: 'other', label: 'Other', color: 'text-text-secondary' },
  ];

  return (
    <div className="flex gap-2 mb-6 flex-wrap">
      <div className="bg-surface-secondary border border-border rounded px-4 py-3">
        <div className="text-text-primary text-base font-bold">{stats.total}</div>
        <div className="text-text-secondary text-[10px]">Total</div>
      </div>
      {types.filter(t => (stats.byType?.[t.key] || 0) > 0).map(t => (
        <div key={t.key} className="bg-surface-secondary border border-border rounded px-4 py-3">
          <div className={`text-text-primary text-base font-bold ${t.color}`}>{stats.byType[t.key]}</div>
          <div className="text-text-secondary text-[10px]">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
