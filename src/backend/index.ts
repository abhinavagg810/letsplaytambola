// Picks the data layer once, at startup: Supabase when it is configured, otherwise demo mode.
import { createLocalBackend } from './local';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

// Must be read as literal `process.env.EXPO_PUBLIC_*` expressions so Expo can inline them at build time.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const backend: Backend = url && anonKey ? createSupabaseBackend(url, anonKey) : createLocalBackend();

export { DEMO_CONTACTS, DEMO_OTP, seedDemoData } from './local';
export * from './types';
