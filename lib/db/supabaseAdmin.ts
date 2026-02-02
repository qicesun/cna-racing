import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdminConfig = {
    url: string;
    serviceRoleKey: string;
};

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing ${key} (set it in Vercel + local .env.local).`);
    return value;
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig {
    const url = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // Basic sanity check to prevent confusing runtime errors.
    if (!/^https:\/\/.+/i.test(url)) {
        throw new Error("Invalid SUPABASE_URL (expected an https URL).");
    }

    return { url, serviceRoleKey };
}

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
    if (cachedAdmin) return cachedAdmin;

    const cfg = getSupabaseAdminConfig();
    cachedAdmin = createClient(cfg.url, cfg.serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return cachedAdmin;
}

