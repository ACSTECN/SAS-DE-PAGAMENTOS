import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let _admin: SupabaseClient | null = null;
let _public: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _admin;
}

export function getSupabasePublic(): SupabaseClient {
  if (!_public) {
    _public = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _public;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabaseAdmin(), prop);
  },
});

export const supabasePublic = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabasePublic(), prop);
  },
});
