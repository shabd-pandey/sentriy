import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import CommandDeck from "./CommandDeck";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

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
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        <AuthenticatedDeck />
      </ClerkProvider>
    ) : (
      <CommandDeck authConfigured={false} />
    )}
  </React.StrictMode>,
);
