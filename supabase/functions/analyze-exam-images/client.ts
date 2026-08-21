import { createClient } from "@supabase/supabase-js";

export function createAuthClient(
  supabaseUrl: string,
  anonKey: string,
  customFetch?: typeof globalThis.fetch,
) {
  return createClient(supabaseUrl, anonKey, {
    global: customFetch ? { fetch: customFetch } : {},
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  customFetch?: typeof globalThis.fetch,
) {
  return createClient(supabaseUrl, anonKey, {
    // Keep user validation and RLS requests on separate clients. Supplying the
    // access token this way makes every database/storage request receive one
    // canonical Authorization header without relying on global header merging.
    accessToken: async () => token,
    global: customFetch ? { fetch: customFetch } : {},
  });
}
