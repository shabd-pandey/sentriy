import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import CommandDeck from "./CommandDeck";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

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
          <p>Reload to try again. If it persists, the preview store may hold a bad row — reset it from the System tab after signing in.</p>
          <p className="cd-muted"><code>{this.state.message}</code></p>
          <button type="button" className="cd-primary" onClick={() => window.location.reload()}>Reload</button>
        </main>
      </div>
    );
  }
}

function AuthenticatedDeck() {
  const { getToken, isSignedIn } = useAuth();
  const authControls = (
    <span className="cd-auth-controls">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="cd-mini">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </span>
  );
  return (
    <CommandDeck
      authConfigured
      signedIn={isSignedIn === true}
      getToken={() => getToken({ template: "platform-api" })}
      authControls={authControls}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DeckErrorBoundary>
      {publishableKey ? (
        <ClerkProvider publishableKey={publishableKey}>
          <AuthenticatedDeck />
        </ClerkProvider>
      ) : (
        <CommandDeck authConfigured={false} />
      )}
    </DeckErrorBoundary>
  </React.StrictMode>,
);
