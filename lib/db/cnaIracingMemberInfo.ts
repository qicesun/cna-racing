import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const MEMBER_INFO_TABLE = "cna_iracing_member_info";

export type CnaIracingMemberInfoRow = {
    iracingCustId: number;
    data: unknown;
    fetchedAt: string;
    expiresAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaIracingMemberInfo(params: {
    iracingCustId: number;
    data: unknown;
    fetchedAt: string;
    expiresAt: string;
}): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(MEMBER_INFO_TABLE)
        .upsert(
            {
                iracing_cust_id: params.iracingCustId,
                data: params.data,
                fetched_at: params.fetchedAt,
                expires_at: params.expiresAt,
            },
            { onConflict: "iracing_cust_id" }
        );

    if (error) fail("Supabase upsert member info failed", error);
}

export async function getCnaIracingMemberInfoByCustId(
    iracingCustId: number
): Promise<CnaIracingMemberInfoRow | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(MEMBER_INFO_TABLE)
        .select("iracing_cust_id, data, fetched_at, expires_at")
        .eq("iracing_cust_id", iracingCustId)
        .limit(1);

    if (error) fail("Supabase get member info failed", error);

    const row = (data ?? [])[0];
    if (!row) return null;

    const custId =
        typeof row.iracing_cust_id === "number" ? row.iracing_cust_id : Number(row.iracing_cust_id);
    const fetchedAt = typeof row.fetched_at === "string" ? row.fetched_at : null;
    const expiresAt = typeof row.expires_at === "string" ? row.expires_at : null;
    const stored = row.data ?? null;

    if (!Number.isFinite(custId) || !fetchedAt || !expiresAt) return null;

    return { iracingCustId: custId, data: stored, fetchedAt, expiresAt };
}

