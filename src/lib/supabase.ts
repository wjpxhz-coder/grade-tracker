import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    publishableKey &&
    !supabaseUrl.includes('YOUR_PROJECT') &&
    !publishableKey.includes('REPLACE_ME'),
)

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? publishableKey : 'sb_publishable_placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'our-growth-journal-session',
    },
  },
)

export const ATTACHMENT_BUCKET = 'exam-attachments'
export const PROFILE_AVATAR_BUCKET = 'profile-avatars'
