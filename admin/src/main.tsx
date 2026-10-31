import React from "react";
import ReactDOM from "react-dom/client";
import CommandDeck from "./CommandDeck";
import "./index.css";

// Sign-in is disabled on this deployment. The Command Deck loads the shared
// backend directly: the API identifies the operator by the `x-demo-admin`
// marker (see api.ts) while Clerk is unconfigured. Bookings booked in the
// customer app land here as `payment_pending` for confirmation.

class DeckErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "render_failed" };
  }

  componentDidCatch() {
    // Rendered fallback below; details stay in the console for the operator.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="cd-shell">
        <main className="cd-content" role="alert">
          <p className="cd-eyebrow">COMMAND DECK</p>
          <h1>Something broke on this screen</h1>
          <p>Reload to try again. If it persists, the preview store may hold a bad row — reset it from the System tab.</p>
          <p className="cd-muted"><code>{this.state.message}</code></p>
          <button type="button" className="cd-primary" onClick={() => window.location.reload()}>Reload</button>
        </main>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DeckErrorBoundary>
      <CommandDeck />
    </DeckErrorBoundary>
  </React.StrictMode>,
);
