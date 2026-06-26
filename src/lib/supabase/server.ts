/**
 * Server-side Supabase client + helpers.
 *
 * Creates a Supabase client that reads the auth session from Next.js cookies
 * (set by the browser client + refreshed by middleware). Used by API route
 * handlers to identify the authenticated user.
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — setting cookies is not possible
            // during render. The middleware refreshes the session instead.
          }
        },
      },
    }
  )
}

/** Returns the authenticated user's UUID, or '' if not logged in. */
export async function getUserId(): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || ''
}

/** Returns the authenticated user's email, or '' if not logged in. */
export async function getUserEmail(): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email || ''
}
