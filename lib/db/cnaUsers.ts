import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const USERS_TABLE = "cna_users";

export type CnaUser = {
    iracingCustId: number;
    iracingName: string;
    updatedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaUser(user: { iracingCustId: number; iracingName: string }): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(USERS_TABLE)
        .upsert(
            {
                iracing_cust_id: user.iracingCustId,
                iracing_name: user.iracingName,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "iracing_cust_id" }
        );

    if (error) fail("Supabase upsert user failed", error);
}

export async function listCnaUsers(limit = 1000): Promise<CnaUser[]> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select("iracing_cust_id, iracing_name, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (error) fail("Supabase list users failed", error);

    return (data ?? [])
        .map((row: any) => {
            const custId = typeof row.iracing_cust_id === "number" ? row.iracing_cust_id : Number(row.iracing_cust_id);
            const name = typeof row.iracing_name === "string" ? row.iracing_name : null;
            const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
            if (!Number.isFinite(custId) || !name || !updatedAt) return null;
            return { iracingCustId: custId, iracingName: name, updatedAt } satisfies CnaUser;
        })
        .filter((u: CnaUser | null): u is CnaUser => u !== null);
}

