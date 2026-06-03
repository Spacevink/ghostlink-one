import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type Project = {
  id: string
  owner_id: string
  name: string
  description: string | null
  subdomain: string | null
  repo_url: string | null
  supabase_project_ref: string | null
  color: string
  icon: string | null
  status: 'empty' | 'active' | 'archived'
  created_at: string
  updated_at: string
}
