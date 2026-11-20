// Build-time configuration. In production these come from GitHub Actions
// secrets (see .github/workflows/deploy.yml); locally from .env.local.
// The anon key is public by design — Postgres row-level security is what
// keeps data safe — but we still keep it out of the repository.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_URL = url?.replace(/\/$/, '') ?? '';
export const SUPABASE_ANON_KEY = key ?? '';
export const isConfigured = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

export const TIME_ZONE = 'America/New_York';
export const SITE_BASE = import.meta.env.BASE_URL;
