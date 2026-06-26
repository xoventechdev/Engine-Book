'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { Loader2, FileText, Mail, Lock, ArrowLeft } from 'lucide-react'

export function AuthDialog() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // "forgot" view replaces the auth form with a password-reset form
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const { toast } = useToast()

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast({ title: 'Error', description: 'Enter your email and password', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      // AuthGate's onAuthStateChange will detect the session and swap UI
    } catch (err) {
      toast({
        title: 'Login failed',
        description: err instanceof Error ? err.message : 'Invalid credentials',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!email.trim() || !password) {
      toast({ title: 'Error', description: 'Enter your email and password', variant: 'destructive' })
      return
    }
    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' })
      return
    }
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) throw error

      // If email confirmation is enabled in Supabase, no session is returned.
      // Show a message instead of expecting immediate login.
      if (!data.session) {
        toast({
          title: 'Check your email',
          description: 'A confirmation link has been sent. Click it to activate your account.',
        })
        setForgotMode(false)
      } else {
        // No confirmation required — user is logged in immediately.
        // AuthGate's onAuthStateChange will detect the session.
        toast({ title: 'Account created', description: 'You are now signed in.' })
      }
    } catch (err) {
      toast({
        title: 'Sign up failed',
        description: err instanceof Error ? err.message : 'Could not create account',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({ title: 'Enter your email', description: 'Type the email you signed up with above.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setForgotSent(true)
      toast({ title: 'Reset link sent', description: `Check ${email.trim()} for a password reset link.` })
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: err instanceof Error ? err.message : 'Could not send reset email',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // ---- Forgot-password view ----
  if (forgotMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="h-14 w-14 rounded-xl bg-emerald-600 flex items-center justify-center mx-auto">
              <FileText className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
              <p className="text-sm text-muted-foreground">Engine Book</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            {forgotSent ? (
              <div className="text-center space-y-4 py-4">
                <Mail className="h-10 w-10 text-emerald-500 mx-auto" />
                <div>
                  <p className="text-sm font-medium">Check your email</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A password reset link has been sent to <strong>{email.trim()}</strong>.
                    Click the link to choose a new password.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && handleForgotPassword()}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                </div>
                <Button onClick={handleForgotPassword} disabled={loading} className="w-full gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setForgotMode(false); setForgotSent(false) }}
              className="w-full gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Login / Signup view ----
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo + title */}
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-xl bg-emerald-600 flex items-center justify-center mx-auto">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Engine Book</h1>
            <p className="text-sm text-muted-foreground">AI Engineering Document Assistant</p>
          </div>
        </div>

        {/* Auth tabs */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* Login */}
            <TabsContent value="login" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button onClick={handleLogin} disabled={loading} className="w-full gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <button
                type="button"
                onClick={() => { setForgotMode(true); setForgotSent(false) }}
                className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Forgot your password?
              </button>
            </TabsContent>

            {/* Signup */}
            <TabsContent value="signup" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleSignup()}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button onClick={handleSignup} disabled={loading} className="w-full gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Your projects are private to your account. AI keys stay in your browser.
        </p>
      </div>
    </div>
  )
}
