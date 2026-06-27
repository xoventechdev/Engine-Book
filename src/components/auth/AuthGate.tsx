'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { Loader2 } from 'lucide-react'

interface AuthGateProps {
  children: React.ReactNode
}

/**
 * Wraps the app. While the Supabase session is being checked, shows a spinner.
 * If no session exists, shows the AuthDialog (login/signup). Once authenticated,
 * renders children.
 *
 * Special case: when Supabase sends a PASSWORD_RECOVERY event (user clicked
 * the reset link in their email), we show the AuthDialog in "reset" mode so
 * they can set a new password — instead of dropping them into the workspace.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth state changes (login, signup, logout, password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY fires when the user clicks the reset link in the email.
      // The session exists (recovery session) so `user` is set, but we don't want
      // to show the workspace — we want the "set new password" form.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        setUser(session?.user ?? null)
        return
      }

      // Any other auth event (sign in, sign up, sign out) cancels recovery mode
      setPasswordRecovery(false)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Password recovery flow — show the "set new password" form
  if (passwordRecovery) {
    return <AuthDialog mode="reset" />
  }

  if (!user) {
    return <AuthDialog />
  }

  return <>{children}</>
}
