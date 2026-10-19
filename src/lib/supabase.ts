import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

let anon: SupabaseClient | undefined;
let session: SupabaseClient | undefined;

/** Public reads and tip/poll submissions. Never carries a login, even if a
 *  staff member is signed in elsewhere on this origin. */
export function anonClient(): SupabaseClient {
  if (!isConfigured) throw new Error('Backend is not configured.');
  anon ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return anon;
}

/** The staff consoles: persistent, auto-refreshing session. */
export function sessionClient(): SupabaseClient {
  if (!isConfigured) throw new Error('Backend is not configured.');
  session ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'falcon-times-auth',
    },
  });
  return session;
}

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
