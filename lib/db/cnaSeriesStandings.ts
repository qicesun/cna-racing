import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const STANDINGS_TABLE = "cna_series_standings";

export type CnaSeriesStandings = {
    seriesKey: string;
    seasonKey: string;
    data: unknown;
    updatedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaSeriesStandings(params: {
    seriesKey: string;
    seasonKey: string;
    data: unknown;
    updatedAt: string;
}): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(STANDINGS_TABLE)
        .upsert(
            {
                series_key: params.seriesKey,
                season_key: params.seasonKey,
                data: params.data,
                updated_at: params.updatedAt,
            },
            { onConflict: "series_key,season_key" }
        );

    if (error) fail("Supabase upsert series standings failed", error);
}

export async function getCnaSeriesStandings(params: {
    seriesKey: string;
    seasonKey: string;
}): Promise<CnaSeriesStandings | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(STANDINGS_TABLE)
        .select("series_key, season_key, data, updated_at")
        .eq("series_key", params.seriesKey)
        .eq("season_key", params.seasonKey)
        .limit(1);

    if (error) fail("Supabase get series standings failed", error);

    const row = (data ?? [])[0];
    if (!row) return null;

    if (
        typeof row.series_key !== "string" ||
        typeof row.season_key !== "string" ||
        typeof row.updated_at !== "string"
    ) {
        return null;
    }

    return {
        seriesKey: row.series_key,
        seasonKey: row.season_key,
        data: row.data ?? null,
        updatedAt: row.updated_at,
    };
}

