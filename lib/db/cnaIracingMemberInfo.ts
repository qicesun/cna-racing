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

export async function listCnaIracingMemberInfoByCustIds(
    iracingCustIds: number[],
    opts?: { chunkSize?: number }
): Promise<CnaIracingMemberInfoRow[]> {
    const ids = Array.from(
        new Set(
            (iracingCustIds ?? [])
                .map((id) => (typeof id === "number" ? id : Number(id)))
                .filter((id) => Number.isFinite(id) && id > 0)
        )
    );
    if (ids.length === 0) return [];

    const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? 200, 1000));
    const supabase = getSupabaseAdminClient();

    const out: CnaIracingMemberInfoRow[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);

        const { data, error } = await supabase
            .from(MEMBER_INFO_TABLE)
            .select("iracing_cust_id, data, fetched_at, expires_at")
            .in("iracing_cust_id", slice)
            .limit(slice.length);

        if (error) fail("Supabase list member info failed", error);

        for (const row of data ?? []) {
            const custId =
                typeof (row as any).iracing_cust_id === "number"
                    ? (row as any).iracing_cust_id
                    : Number((row as any).iracing_cust_id);
            const fetchedAt = typeof (row as any).fetched_at === "string" ? (row as any).fetched_at : null;
            const expiresAt = typeof (row as any).expires_at === "string" ? (row as any).expires_at : null;
            const stored = (row as any).data ?? null;

            if (!Number.isFinite(custId) || !fetchedAt || !expiresAt) continue;
            out.push({ iracingCustId: custId, data: stored, fetchedAt, expiresAt });
        }
    }

    return out;
}
