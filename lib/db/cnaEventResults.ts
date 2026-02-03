import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabaseAdmin";

const RESULTS_TABLE = "cna_event_results";

export type CnaEventResult = {
    eventId: string;
    seriesKey: string;
    subsessionId: number;
    startTime: string | null;
    trackName: string | null;
    rawJson: unknown;
    raceResults: unknown;
    fetchedAt: string;
};

function fail(context: string, error: unknown): never {
    const msg =
        error && typeof error === "object" && "message" in error ? String((error as any).message) : String(error);
    throw new Error(`${context}: ${msg}`);
}

export async function upsertCnaEventResult(params: {
    eventId: string;
    seriesKey: string;
    subsessionId: number;
    startTime: string | null;
    trackName: string | null;
    rawJson: unknown;
    raceResults: unknown;
    fetchedAt: string;
}): Promise<void> {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
        .from(RESULTS_TABLE)
        .upsert(
            {
                event_id: params.eventId,
                series_key: params.seriesKey,
                subsession_id: params.subsessionId,
                start_time: params.startTime,
                track_name: params.trackName,
                raw_json: params.rawJson,
                race_results: params.raceResults,
                fetched_at: params.fetchedAt,
            },
            { onConflict: "event_id" }
        );

    if (error) fail("Supabase upsert event result failed", error);
}

export async function getCnaEventResultByEventId(eventId: string): Promise<CnaEventResult | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(RESULTS_TABLE)
        .select("event_id, series_key, subsession_id, start_time, track_name, raw_json, race_results, fetched_at")
        .eq("event_id", eventId)
        .limit(1);

    if (error) fail("Supabase get event result failed", error);
    const row = (data ?? [])[0];
    if (!row) return null;

    const subsessionId =
        typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);

    if (
        typeof row.event_id !== "string" ||
        typeof row.series_key !== "string" ||
        !Number.isFinite(subsessionId) ||
        typeof row.fetched_at !== "string"
    ) {
        return null;
    }

    return {
        eventId: row.event_id,
        seriesKey: row.series_key,
        subsessionId,
        startTime: typeof row.start_time === "string" ? row.start_time : null,
        trackName: typeof row.track_name === "string" ? row.track_name : null,
        rawJson: row.raw_json ?? null,
        raceResults: row.race_results ?? null,
        fetchedAt: row.fetched_at,
    };
}

export async function listCnaEventResultsBySeriesSeason(params: {
    seriesKey: string;
    seasonKey: string;
    limit?: number;
}): Promise<CnaEventResult[]> {
    const supabase = getSupabaseAdminClient();
    const limit = params.limit ?? 200;

    const pattern = `${params.seriesKey}:${params.seasonKey}:%`;

    const { data, error } = await supabase
        .from(RESULTS_TABLE)
        .select("event_id, series_key, subsession_id, start_time, track_name, raw_json, race_results, fetched_at")
        .eq("series_key", params.seriesKey)
        .like("event_id", pattern)
        .order("event_id", { ascending: true })
        .limit(limit);

    if (error) fail("Supabase list event results failed", error);

    return (data ?? [])
        .map((row: any) => {
            const eventId = typeof row.event_id === "string" ? row.event_id : null;
            const seriesKey = typeof row.series_key === "string" ? row.series_key : null;
            const subsessionId =
                typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);
            const fetchedAt = typeof row.fetched_at === "string" ? row.fetched_at : null;
            if (!eventId || !seriesKey || !Number.isFinite(subsessionId) || !fetchedAt) return null;
            return {
                eventId,
                seriesKey,
                subsessionId,
                startTime: typeof row.start_time === "string" ? row.start_time : null,
                trackName: typeof row.track_name === "string" ? row.track_name : null,
                rawJson: row.raw_json ?? null,
                raceResults: row.race_results ?? null,
                fetchedAt,
            } satisfies CnaEventResult;
        })
        .filter((x: CnaEventResult | null): x is CnaEventResult => x !== null);
}

export type CnaEventResultSummary = {
    eventId: string;
    seriesKey: string;
    subsessionId: number;
    startTime: string | null;
    trackName: string | null;
    raceResults: unknown;
    fetchedAt: string;
};

export async function listCnaEventResultSummariesBySeriesSeason(params: {
    seriesKey: string;
    seasonKey: string;
    limit?: number;
}): Promise<CnaEventResultSummary[]> {
    const supabase = getSupabaseAdminClient();
    const limit = params.limit ?? 200;

    const pattern = `${params.seriesKey}:${params.seasonKey}:%`;

    const { data, error } = await supabase
        .from(RESULTS_TABLE)
        .select("event_id, series_key, subsession_id, start_time, track_name, race_results, fetched_at")
        .eq("series_key", params.seriesKey)
        .like("event_id", pattern)
        .order("event_id", { ascending: true })
        .limit(limit);

    if (error) fail("Supabase list event results failed", error);

    return (data ?? [])
        .map((row: any) => {
            const eventId = typeof row.event_id === "string" ? row.event_id : null;
            const seriesKey = typeof row.series_key === "string" ? row.series_key : null;
            const subsessionId =
                typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);
            const fetchedAt = typeof row.fetched_at === "string" ? row.fetched_at : null;
            if (!eventId || !seriesKey || !Number.isFinite(subsessionId) || !fetchedAt) return null;
            return {
                eventId,
                seriesKey,
                subsessionId,
                startTime: typeof row.start_time === "string" ? row.start_time : null,
                trackName: typeof row.track_name === "string" ? row.track_name : null,
                raceResults: row.race_results ?? null,
                fetchedAt,
            } satisfies CnaEventResultSummary;
        })
        .filter((x: CnaEventResultSummary | null): x is CnaEventResultSummary => x !== null);
}

export async function listCnaEventResults(limit = 200): Promise<CnaEventResult[]> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
        .from(RESULTS_TABLE)
        .select("event_id, series_key, subsession_id, start_time, track_name, raw_json, race_results, fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(limit);

    if (error) fail("Supabase list event results failed", error);

    return (data ?? [])
        .map((row: any) => {
            const eventId = typeof row.event_id === "string" ? row.event_id : null;
            const seriesKey = typeof row.series_key === "string" ? row.series_key : null;
            const subsessionId =
                typeof row.subsession_id === "number" ? row.subsession_id : Number(row.subsession_id);
            const fetchedAt = typeof row.fetched_at === "string" ? row.fetched_at : null;
            if (!eventId || !seriesKey || !Number.isFinite(subsessionId) || !fetchedAt) return null;
            return {
                eventId,
                seriesKey,
                subsessionId,
                startTime: typeof row.start_time === "string" ? row.start_time : null,
                trackName: typeof row.track_name === "string" ? row.track_name : null,
                rawJson: row.raw_json ?? null,
                raceResults: row.race_results ?? null,
                fetchedAt,
            } satisfies CnaEventResult;
        })
        .filter((x: CnaEventResult | null): x is CnaEventResult => x !== null);
}
