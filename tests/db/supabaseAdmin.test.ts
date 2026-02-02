import { describe, expect, it } from "vitest";

import { getSupabaseAdminConfig } from "@/lib/db/supabaseAdmin";

describe("lib/db/supabaseAdmin", () => {
    it("throws when env vars are missing", () => {
        const oldUrl = process.env.SUPABASE_URL;
        const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        try {
            expect(() => getSupabaseAdminConfig()).toThrow(/SUPABASE_URL/i);
        } finally {
            if (oldUrl === undefined) delete process.env.SUPABASE_URL;
            else process.env.SUPABASE_URL = oldUrl;
            if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
        }
    });

    it("validates SUPABASE_URL looks like https", () => {
        const oldUrl = process.env.SUPABASE_URL;
        const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        process.env.SUPABASE_URL = "http://example.com";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "x";

        try {
            expect(() => getSupabaseAdminConfig()).toThrow(/https/i);
        } finally {
            if (oldUrl === undefined) delete process.env.SUPABASE_URL;
            else process.env.SUPABASE_URL = oldUrl;
            if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
        }
    });
});

