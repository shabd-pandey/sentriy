import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/clerk-react'
import App from './App'
import './index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function AuthenticatedApp() {
  const { getToken, isSignedIn } = useAuth()
  const { user } = useUser()
  const authControls = (
    <div className="clerk-auth-controls">
      <SignedOut>
        <SignInButton mode="modal"><button type="button" className="auth-link-button">Sign in</button></SignInButton>
        <SignUpButton mode="modal"><button type="button" className="auth-cta">Create account</button></SignUpButton>
      </SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </div>
  )
  return <App authConfigured getToken={() => getToken({ template: 'platform-api' })} signedIn={isSignedIn === true} authControls={authControls} />
}

// Local development without Clerk. The dev server mints a real RS256 session
// and serves the JWKS the worker verifies it against (see dev/dev-auth.ts), so
// holds, checkout and the wallet all hit the real API. `import.meta.env.DEV` is
// replaced with `false` in a production build, which strips this branch and the
// dev-session fetch from the deployed bundle.
function DevSessionApp() {
  const [state, setState] = useState<'loading' | 'active' | 'offline'>('loading')
  useEffect(() => {
    let live = true
    fetch('/__dev/session', { cache: 'no-store' })
      .then((response) => { if (live) setState(response.ok ? 'active' : 'offline') })
      .catch(() => { if (live) setState('offline') })
    return () => { live = false }
  }, [])
  const getToken = async () => {
    const response = await fetch('/__dev/session', { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { token?: string }
    return body.token ?? null
  }
  if (state === 'loading') return null
  if (state === 'offline') return <App authConfigured={false} />
  return <App authConfigured getToken={getToken} signedIn />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publishableKey
      ? <ClerkProvider publishableKey={publishableKey}><AuthenticatedApp /></ClerkProvider>
      : import.meta.env.DEV
        ? <DevSessionApp />
        : <App authConfigured={false} />}
  </React.StrictMode>,
)
