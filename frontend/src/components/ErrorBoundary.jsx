import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-surface-secondary border border-accent-red/30 rounded p-6">
            <div className="text-accent-red text-sm font-bold font-mono mb-2">// n0va UI crashed</div>
            <div className="text-text-secondary text-xs font-mono mb-4 leading-relaxed">
              {String(this.state.error?.message || this.state.error)}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-3 py-1.5 rounded text-xs font-mono border border-accent-blue text-accent-blue hover:bg-accent-blue/10 transition-colors"
            >
              reload view
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
