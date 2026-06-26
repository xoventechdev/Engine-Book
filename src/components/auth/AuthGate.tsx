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
 * renders children. The Supabase client's onAuthStateChange handles session
 * updates (login, signup, logout) reactively.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth state changes (login, signup, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  if (!user) {
    return <AuthDialog />
  }

  return <>{children}</>
}
