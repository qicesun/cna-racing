import "server-only";

import fs from "fs/promises";
import path from "path";

import { getEventById, listAllEvents, parseEventId } from "@/lib/events/catalog";
import {
    getCnaEventResultByEventId,
    listCnaEventResultSummariesBySeriesSeason,
    type CnaEventResultSummary,
} from "@/lib/db/cnaEventResults";
import { isCnaEventRaceResultsV1 } from "@/lib/results/computeSeriesStandings";
import { parseIracingRaceResult } from "@/lib/results/parseEventResult";
import type { CnaEventRaceResultsV1 } from "@/lib/results/types";

type LegacyIndexEntry = {
    id?: string | number;
    date?: string;
    file: string;
};

export type ResolvedEventResult = {
    eventId: string;
    seriesKey: string;
    seasonKey: string;
    round: number;
    source: "db" | "static";
    subsessionId: number | null;
    rawJson: unknown;
    raceResults: CnaEventRaceResultsV1;
    startTime: string | null;
    trackName: string | null;
    fetchedAt: string | null; // only present for DB-backed results
};

const MAX_MATCH_DISTANCE_MS = 36 * 60 * 60 * 1000; // 36 hours

async function readJsonFromPublic<T>(publicPath: string): Promise<T | null> {
    try {
        const full = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
        const raw = await fs.readFile(full, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function parseTimeMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

function pickBestMatchEventId(params: {
    eventStartMsById: Array<{ eventId: string; startMs: number }>;
    candidateMs: number;
}): { eventId: string; distanceMs: number } | null {
    let best: { eventId: string; distanceMs: number } | null = null;

    for (const e of params.eventStartMsById) {
        const d = Math.abs(e.startMs - params.candidateMs);
        if (!best || d < best.distanceMs) best = { eventId: e.eventId, distanceMs: d };
    }

    if (!best) return null;
    if (best.distanceMs > MAX_MATCH_DISTANCE_MS) return null;
    return best;
}

async function buildStaticResultMap(params: {
    seriesKey: string;
    seasonKey: string;
}): Promise<Map<string, { rawJson: unknown; raceResults: CnaEventRaceResultsV1; startTime: string | null; trackName: string | null }>> {
    const events = listAllEvents().filter((e) => e.seriesKey === params.seriesKey && e.seasonKey === params.seasonKey);
    const eventStartMsById = events
        .map((e) => ({ eventId: e.eventId, startMs: parseTimeMs(e.start) }))
        .filter((e): e is { eventId: string; startMs: number } => typeof e.startMs === "number");

    const indexPath = `/${params.seriesKey}/results/index.json`;
    const index = (await readJsonFromPublic<LegacyIndexEntry[]>(indexPath)) ?? [];

    const byEventId = new Map<
        string,
        { rawJson: unknown; raceResults: CnaEventRaceResultsV1; startTime: string | null; trackName: string | null; distanceMs: number }
    >();

    for (const entry of index) {
        const rawJson = await readJsonFromPublic<unknown>(entry.file);
        if (!rawJson) continue;

        let parsed;
        try {
            parsed = parseIracingRaceResult(rawJson);
        } catch {
            continue;
        }

        const candidateMs = parseTimeMs(parsed.startTime ?? entry.date);
        if (candidateMs === null) continue;

        const best = pickBestMatchEventId({ eventStartMsById, candidateMs });
        if (!best) continue;

        const prev = byEventId.get(best.eventId);
        if (!prev || best.distanceMs < prev.distanceMs) {
            byEventId.set(best.eventId, { rawJson, raceResults: parsed.raceResults, startTime: parsed.startTime, trackName: parsed.trackName, distanceMs: best.distanceMs });
        }
    }

    const out = new Map<string, { rawJson: unknown; raceResults: CnaEventRaceResultsV1; startTime: string | null; trackName: string | null }>();
    for (const [eventId, v] of byEventId.entries()) {
        out.set(eventId, { rawJson: v.rawJson, raceResults: v.raceResults, startTime: v.startTime, trackName: v.trackName });
    }
    return out;
}

function toResolvedFromDbRow(row: Awaited<ReturnType<typeof getCnaEventResultByEventId>>, eventId: string): ResolvedEventResult | null {
    if (!row) return null;
    const parsed = parseEventId(eventId);
    if (!parsed) return null;

    let raceResults: CnaEventRaceResultsV1 | null = null;
    if (isCnaEventRaceResultsV1(row.raceResults)) raceResults = row.raceResults;
    if (!raceResults) {
        try {
            raceResults = parseIracingRaceResult(row.rawJson).raceResults;
        } catch {
            return null;
        }
    }

    return {
        eventId,
        seriesKey: parsed.seriesKey,
        seasonKey: parsed.seasonKey,
        round: parsed.round,
        source: "db",
        subsessionId: row.subsessionId,
        rawJson: row.rawJson,
        raceResults,
        startTime: row.startTime,
        trackName: row.trackName,
        fetchedAt: row.fetchedAt,
    };
}

function toResolvedFromDbSummary(row: CnaEventResultSummary, eventId: string): ResolvedEventResult | null {
    const parsed = parseEventId(eventId);
    if (!parsed) return null;

    if (!isCnaEventRaceResultsV1(row.raceResults)) return null;

    return {
        eventId,
        seriesKey: parsed.seriesKey,
        seasonKey: parsed.seasonKey,
        round: parsed.round,
        source: "db",
        subsessionId: row.subsessionId,
        rawJson: null,
        raceResults: row.raceResults,
        startTime: row.startTime,
        trackName: row.trackName,
        fetchedAt: row.fetchedAt,
    };
}

export async function getResolvedEventResultByEventId(eventIdRaw: string): Promise<ResolvedEventResult | null> {
    const parsed = parseEventId(eventIdRaw);
    if (!parsed) return null;

    // Only resolve known events (prevents matching legacy files to the wrong season).
    const event = getEventById(eventIdRaw);
    if (!event) return null;

    const dbRow = await getCnaEventResultByEventId(eventIdRaw);
    const fromDb = toResolvedFromDbRow(dbRow, eventIdRaw);
    if (fromDb) return fromDb;

    const staticMap = await buildStaticResultMap({ seriesKey: parsed.seriesKey, seasonKey: parsed.seasonKey });
    const hit = staticMap.get(eventIdRaw);
    if (!hit) return null;

    return {
        eventId: eventIdRaw,
        seriesKey: parsed.seriesKey,
        seasonKey: parsed.seasonKey,
        round: parsed.round,
        source: "static",
        subsessionId: null,
        rawJson: hit.rawJson,
        raceResults: hit.raceResults,
        startTime: hit.startTime,
        trackName: hit.trackName,
        fetchedAt: null,
    };
}

export async function listResolvedEventResultsBySeriesSeason(params: {
    seriesKey: string;
    seasonKey: string;
}): Promise<ResolvedEventResult[]> {
    const events = listAllEvents()
        .filter((e) => e.seriesKey === params.seriesKey && e.seasonKey === params.seasonKey)
        .sort((a, b) => a.round - b.round);

    const dbRows = await listCnaEventResultSummariesBySeriesSeason({
        seriesKey: params.seriesKey,
        seasonKey: params.seasonKey,
    });
    const dbByEventId = new Map(dbRows.map((r) => [r.eventId, r]));

    const staticMap = await buildStaticResultMap({ seriesKey: params.seriesKey, seasonKey: params.seasonKey });

    const out: ResolvedEventResult[] = [];

    for (const e of events) {
        const db = dbByEventId.get(e.eventId);
        if (db) {
            const resolved = toResolvedFromDbSummary(db, e.eventId);
            if (resolved) out.push(resolved);
            continue;
        }

        const legacy = staticMap.get(e.eventId);
        if (!legacy) continue;

        out.push({
            eventId: e.eventId,
            seriesKey: params.seriesKey,
            seasonKey: params.seasonKey,
            round: e.round,
            source: "static",
            subsessionId: null,
            rawJson: null,
            raceResults: legacy.raceResults,
            startTime: legacy.startTime,
            trackName: legacy.trackName,
            fetchedAt: null,
        });
    }

    return out;
}
