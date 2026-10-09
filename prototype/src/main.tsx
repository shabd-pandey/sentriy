import React from 'react'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publishableKey
      ? <ClerkProvider publishableKey={publishableKey}><AuthenticatedApp /></ClerkProvider>
      : <App authConfigured={false} />}
  </React.StrictMode>,
)
