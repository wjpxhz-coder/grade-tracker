/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_LOGIN_A_NAME?: string
  readonly VITE_LOGIN_A_ALIAS?: string
  readonly VITE_LOGIN_B_NAME?: string
  readonly VITE_LOGIN_B_ALIAS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
