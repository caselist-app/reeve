import { createClient } from '@supabase/supabase-js'

// Service role client: bypasses RLS by design.
// Only import this in server-side jobs, webhooks, and cron handlers.
// Never import in client code or Server Components that handle user requests.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
