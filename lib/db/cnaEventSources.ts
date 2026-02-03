import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const SOURCES_TABLE = "cna_event_sources";

export type CnaEventSource = {
    eventId: string;
    seriesKey: string;
    subsessionId: number;
    createdBy: number | null;
    createdAt: string;
    updatedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaEventSource(params: {
    eventId: string;
    seriesKey: string;
    subsessionId: number;
    createdBy: number | null;
}): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const now = new Date().toISOString();
    const { error } = await supabase
        .from(SOURCES_TABLE)
        .upsert(
            {
                event_id: params.eventId,
                series_key: params.seriesKey,
                subsession_id: params.subsessionId,
                created_by: params.createdBy,
                updated_at: now,
            },
            { onConflict: "event_id" }
        );

    if (error) fail("Supabase upsert event source failed", error);
}

export async function getCnaEventSourceByEventId(eventId: string): Promise<CnaEventSource | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(SOURCES_TABLE)
        .select("event_id, series_key, subsession_id, created_by, created_at, updated_at")
        .eq("event_id", eventId)
        .limit(1);

    if (error) fail("Supabase get event source failed", error);
    const row = (data ?? [])[0];
    if (!row) return null;

    const subsessionId =
        typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);
    const createdBy =
        row.created_by === null || row.created_by === undefined
            ? null
            : typeof row.created_by === "number"
                ? row.created_by
                : Number(row.created_by);

    if (
        typeof row.event_id !== "string" ||
        typeof row.series_key !== "string" ||
        !Number.isFinite(subsessionId) ||
        !row.created_at ||
        !row.updated_at
    ) {
        return null;
    }

    return {
        eventId: row.event_id,
        seriesKey: row.series_key,
        subsessionId,
        createdBy: Number.isFinite(createdBy as number) ? (createdBy as number) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

export async function listCnaEventSources(limit = 1000): Promise<CnaEventSource[]> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(SOURCES_TABLE)
        .select("event_id, series_key, subsession_id, created_by, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (error) fail("Supabase list event sources failed", error);

    return (data ?? [])
        .map((row: any) => {
            const eventId = typeof row.event_id === "string" ? row.event_id : null;
            const seriesKey = typeof row.series_key === "string" ? row.series_key : null;
            const subsessionId = typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);
            const createdBy =
                row.created_by === null || row.created_by === undefined
                    ? null
                    : typeof row.created_by === "number"
                        ? row.created_by
                        : Number(row.created_by);
            const createdAt = typeof row.created_at === "string" ? row.created_at : null;
            const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
            if (!eventId || !seriesKey || !Number.isFinite(subsessionId) || !createdAt || !updatedAt) return null;
            return {
                eventId,
                seriesKey,
                subsessionId,
                createdBy: Number.isFinite(createdBy as number) ? (createdBy as number) : null,
                createdAt,
                updatedAt,
            } satisfies CnaEventSource;
        })
        .filter((x: CnaEventSource | null): x is CnaEventSource => x !== null);
}

