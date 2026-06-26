/**
 * Browser-side Supabase client.
 *
 * Used by client components for auth (sign in, sign up, sign out, session
 * listener). The URL and anon key are safe to expose publicly — Supabase
 * enforces access via Row Level Security, not key secrecy.
 */

import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
