import { Component } from 'react';

/**
 * Catches render errors anywhere below it.
 *
 * Without one, a single thrown error in any component unmounts the whole tree
 * and the user is left staring at a blank white page with no indication that
 * anything went wrong or what to do next.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Something broke on this page</h1>
          <p className="text-sm text-gray-400 mb-5">
            The rest of the app is still fine. Try again, or head back home.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-5 py-2 bg-veil-purple hover:bg-veil-indigo text-white rounded-lg text-sm font-medium"
            >
              Try again
            </button>
            <a
              href="/"
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-sm"
            >
              Go home
            </a>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-5 text-left text-xs text-rose-300 bg-slate-950 rounded-lg p-3 overflow-auto max-h-48">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
