import { useState, useEffect, useCallback } from 'react';
import Landing from './components/Landing';
import Sidebar from './components/Sidebar';
import Executor from './components/Executor';
import History from './components/History';
import ToolGrid from './components/ToolGrid';
import AddTool from './components/AddTool';
import Stats from './components/Stats';
import Analyze from './components/Analyze';
import Store from './components/Store';
import TerminalPanel from './components/TerminalPanel';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const [inDashboard, setInDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState('scan');
  const [tools, setTools] = useState([]);
  const [stats, setStats] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchTools();
    fetchStats();
  }, []);

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (e) { console.error('Failed to fetch tools:', e); }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      setStats(await res.json());
    } catch (e) { console.error('Failed to fetch stats:', e); }
  };

  const handleToolAdded = () => { fetchTools(); fetchStats(); };

  const [scanTarget, setScanTarget] = useState(null);

  const handleStartScan = useCallback((analysisResult) => {
    setScanTarget(analysisResult);
    setActiveTab('scan');
  }, []);

  const tabs = [
    { key: 'analyze', label: 'Analyze', icon: '?' },
    { key: 'scan', label: 'Scan', icon: '>' },
    { key: 'history', label: 'History', icon: '~' },
    { key: 'tools', label: 'Tools', icon: '#' },
    { key: 'add', label: 'Add Tool', icon: '+' },
    { key: 'store', label: 'Store', icon: '$' },
  ];

  if (!inDashboard) {
    return <Landing onEnter={() => setInDashboard(true)} stats={stats} />;
  }

  // All tab panels stay mounted; inactive ones are hidden via the `hidden` class.
  // This preserves each component's state + in-flight fetch/WebSocket across tab switches.
  const Tab = ({ name, children }) => (
    <div className={activeTab === name ? '' : 'hidden'}>{children}</div>
  );

  return (
    <div className="h-screen bg-surface flex overflow-hidden">
      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(key) => { setActiveTab(key); setSidebarOpen(false); }}
        onBackToLanding={() => setInDashboard(false)}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onClose={() => setSidebarOpen(false)}
        stats={stats}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-content mx-auto px-6 md:px-6 px-4 py-8">
            <ErrorBoundary>
              <Tab name="analyze"><Analyze onStartScan={handleStartScan} /></Tab>
              <Tab name="scan"><Executor tools={tools} initialTarget={scanTarget} onClearTarget={() => setScanTarget(null)} /></Tab>
              <Tab name="history"><History /></Tab>
              <Tab name="tools"><Stats stats={stats} /><ToolGrid tools={tools} onRefresh={fetchTools} /></Tab>
              <Tab name="add"><AddTool onToolAdded={handleToolAdded} /></Tab>
              <Tab name="store"><Store tools={tools} onRefresh={fetchTools} /></Tab>
            </ErrorBoundary>
          </div>
        </main>

        <TerminalPanel />
      </div>
    </div>
  );
}

export default App;
