import { createClient } from '@supabase/supabase-js';
import { env, ensureBackendEnv } from './env.js';

ensureBackendEnv();

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const supabasePublic = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
