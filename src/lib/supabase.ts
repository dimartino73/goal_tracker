import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Utan miljövariabler visar appen en förklaring i stället för att krascha vid
// import, så en bygge utan .env syns direkt och inte som en vit sida.
export const supabase = configured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
