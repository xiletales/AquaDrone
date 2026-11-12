import { createClient } from "npm:@supabase/supabase-js@2";
import { makeHandlers } from "../_shared/handlers.ts";

// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disuntik otomatis oleh Supabase; kunci tidak pernah ke klien.
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(makeHandlers(admin).telemetry);
