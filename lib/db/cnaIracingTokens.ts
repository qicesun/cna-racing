import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const TOKENS_TABLE = "cna_iracing_tokens";

export type CnaIracingTokensRow = {
    iracingCustId: number;
    accessToken: string;
    accessExpiresAt: string;
    refreshTokenEnc: string | null;
    refreshExpiresAt: string | null;
    scope: string | null;
    updatedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaIracingTokens(params: {
    iracingCustId: number;
    accessToken: string;
    accessExpiresAt: string;
    refreshTokenEnc: string | null;
    refreshExpiresAt: string | null;
    scope: string | null;
}): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(TOKENS_TABLE)
        .upsert(
            {
                iracing_cust_id: params.iracingCustId,
                access_token: params.accessToken,
                access_expires_at: params.accessExpiresAt,
                refresh_token_enc: params.refreshTokenEnc,
                refresh_expires_at: params.refreshExpiresAt,
                scope: params.scope,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "iracing_cust_id" }
        );

    if (error) fail("Supabase upsert iRacing tokens failed", error);
}

export async function getCnaIracingTokensByCustId(iracingCustId: number): Promise<CnaIracingTokensRow | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(TOKENS_TABLE)
        .select("iracing_cust_id, access_token, access_expires_at, refresh_token_enc, refresh_expires_at, scope, updated_at")
        .eq("iracing_cust_id", iracingCustId)
        .limit(1);

    if (error) fail("Supabase get iRacing tokens failed", error);

    const row = (data ?? [])[0];
    if (!row) return null;

    const custId =
        typeof row.iracing_cust_id === "number" ? row.iracing_cust_id : Number(row.iracing_cust_id);
    const accessToken = typeof row.access_token === "string" ? row.access_token : null;
    const accessExpiresAt = typeof row.access_expires_at === "string" ? row.access_expires_at : null;
    const refreshTokenEnc = typeof row.refresh_token_enc === "string" ? row.refresh_token_enc : null;
    const refreshExpiresAt = typeof row.refresh_expires_at === "string" ? row.refresh_expires_at : null;
    const scope = typeof row.scope === "string" ? row.scope : null;
    const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;

    if (!Number.isFinite(custId) || !accessToken || !accessExpiresAt || !updatedAt) return null;

    return {
        iracingCustId: custId,
        accessToken,
        accessExpiresAt,
        refreshTokenEnc,
        refreshExpiresAt,
        scope,
        updatedAt,
    };
}

export async function deleteCnaIracingTokensByCustId(iracingCustId: number): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase.from(TOKENS_TABLE).delete().eq("iracing_cust_id", iracingCustId);
    if (error) fail("Supabase delete iRacing tokens failed", error);
}

