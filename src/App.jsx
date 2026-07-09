import { useState, useEffect } from 'react';
import ToolGrid from './components/ToolGrid';
import AddTool from './components/AddTool';
import Executor from './components/Executor';
import Stats from './components/Stats';

function App() {
  const [activeTab, setActiveTab] = useState('tools');
  const [tools, setTools] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTools();
    fetchStats();
  }, []);

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleToolAdded = () => {
    fetchTools();
    fetchStats();
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">🔧 Tool Orchestrator</h1>
              <p className="text-slate-400 text-sm mt-1">AI-powered tool coordination platform</p>
            </div>
            {stats && (
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{stats.total}</div>
                  <div className="text-xs text-slate-400">Total Tools</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {['tools', 'add', 'execute'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'tools' && '📦 Tools'}
                {tab === 'add' && '➕ Add Tool'}
                {tab === 'execute' && '⚡ Execute'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading && activeTab === 'tools' ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Loading tools...</p>
          </div>
        ) : (
          <>
            {activeTab === 'tools' && (
              <>
                <Stats stats={stats} />
                <ToolGrid tools={tools} onRefresh={fetchTools} />
              </>
            )}
            {activeTab === 'add' && <AddTool onToolAdded={handleToolAdded} />}
            {activeTab === 'execute' && <Executor tools={tools} />}
          </>
        )}
      </main>

      <footer className="bg-slate-800 border-t border-slate-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-slate-400 text-sm">
          <p>Powered by 9router • {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
