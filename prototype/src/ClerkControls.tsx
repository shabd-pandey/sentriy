import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";

export default function ClerkControls() {
  return (
    <div className="clerk-controls">
      <SignedOut>
        <SignInButton mode="modal"><button type="button" className="portal-secondary">Sign in</button></SignInButton>
        <SignUpButton mode="modal"><button type="button" className="portal-primary">Create account</button></SignUpButton>
      </SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </div>
  );
}
