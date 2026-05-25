import { Component, ReactNode } from "react";

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-container">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm space-y-2">
            <p className="font-bold text-destructive">⚠️ Erro ao renderizar esta página</p>
            <p className="text-foreground">{this.state.error.message || String(this.state.error)}</p>
            <pre className="text-[10px] overflow-auto max-h-48 p-2 bg-background/50 rounded">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); location.reload(); }}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs"
            >Recarregar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
