import "server-only";

import fs from "fs/promises";
import path from "path";

import { normalizeName } from "@/lib/points";
import {
    getSession,
    type IRacingEventResultFile,
    sortByFinishPosition,
    unwrapIRacingEvent,
} from "@/lib/iracingResult";
import { getEventById, listAllEvents } from "@/lib/events/catalog";
import { listResolvedEventResultsBySeriesSeason, type ResolvedEventResult } from "@/lib/results/resolvedEventResults";

type IndexEntry = {
    id: string;
    title: string;
    date?: string; // might be missing timezone
    track?: string;
    layout?: string;
    file: string;
    cover?: string;
};

type SeriesSource = {
    key: string; // gt3open / rookie
    label: string; // display label
    indexPath: string;
};

type LicenseEntry = {
    category?: string;
    category_id?: number;
    irating?: number;
    safety_rating?: number;
};

type LicenseMap = Record<string, LicenseEntry[]>;

export type DriverSeriesSeasonStat = {
    seriesKey: string;
    seasonKey: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    updatedAt: string | null;
};

type DriverAccumulator = {
    iracingCustId: number;
    name: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    irating: number | null;
    safetyRating: number | null;
    series: Set<string>; // store series KEYs
    lastRace: {
        seriesKey: string; // stable
        seriesLabel: string; // display
        track: string;
        dateIso?: string;
        timestamp?: number;
    } | null;
    seriesSeasons: Map<string, DriverSeriesSeasonStat>;
};

export type DriverStats = {
    iracingCustId: number;
    name: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    irating: number | null;
    safetyRating: number | null;
    series: string[];
    lastRace: { series: string; track: string; date?: string } | null;
    seriesSeasons: DriverSeriesSeasonStat[];
};

async function readJsonFromPublic<T>(publicPath: string): Promise<T | null> {
    try {
        const full = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
        const raw = await fs.readFile(full, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function selectSportsCarLicense(licenses?: LicenseEntry[]) {
    if (!licenses?.length) return null;
    return licenses.find((license) => license.category === "sports_car" || license.category_id === 5) ?? licenses[0];
}

function parseTimeMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

const SERIES_LABEL: Record<string, string> = {
    gt3open: "GT3 Open",
    rookie: "Rookie",
};

function seriesLabel(seriesKey: string): string {
    return SERIES_LABEL[seriesKey] ?? seriesKey;
}

const DEFAULT_SOURCES: SeriesSource[] = [
    { key: "gt3open", label: "GT3 Open", indexPath: "/gt3open/results/index.json" },
    { key: "rookie", label: "Rookie", indexPath: "/rookie/results/index.json" },
];

function emptyAcc(custId: number, name: string): DriverAccumulator {
    return {
        iracingCustId: custId,
        name,
        points: 0,
        starts: 0,
        wins: 0,
        podiums: 0,
        irating: null,
        safetyRating: null,
        series: new Set<string>(),
        lastRace: null,
        seriesSeasons: new Map(),
    };
}

function listSeriesSeasonsFromCatalog(): Array<{ seriesKey: string; seasonKey: string }> {
    const out = new Map<string, { seriesKey: string; seasonKey: string }>();
    for (const e of listAllEvents()) {
        const key = `${e.seriesKey}:${e.seasonKey}`;
        if (!out.has(key)) out.set(key, { seriesKey: e.seriesKey, seasonKey: e.seasonKey });
    }
    return Array.from(out.values());
}

function maxIso(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    const am = parseTimeMs(a);
    const bm = parseTimeMs(b);
    if (am === null) return b;
    if (bm === null) return a;
    return bm > am ? b : a;
}

async function listResolvedEventsSafe(params: {
    seriesKey: string;
    seasonKey: string;
}): Promise<ResolvedEventResult[]> {
    try {
        return await listResolvedEventResultsBySeriesSeason(params);
    } catch (e) {
        console.error("listResolvedEventResultsBySeriesSeason failed", params, e);
        return [];
    }
}

async function applyStaticLicenseFallback(byCustId: Map<number, DriverAccumulator>): Promise<void> {
    // Fallback for drivers who haven't connected advanced auth: use iR/SR embedded in legacy public result JSON.
    // Best-effort only (DB-imported results may not include driver_licenses without loading raw_json).
    for (const source of DEFAULT_SOURCES) {
        const index = (await readJsonFromPublic<IndexEntry[]>(source.indexPath)) ?? [];

        for (const entry of index) {
            const json = await readJsonFromPublic<IRacingEventResultFile | any>(entry.file);
            const data = unwrapIRacingEvent(json);
            if (!data) continue;

            const race = getSession(data, "RACE");
            if (!race?.results?.length) continue;

            const rows = sortByFinishPosition(race.results);
            const licenseMap = (data as { driver_licenses?: LicenseMap }).driver_licenses;

            for (const row of rows) {
                const custId = typeof row.cust_id === "number" ? row.cust_id : null;
                if (!custId || !Number.isFinite(custId)) continue;

                const current = byCustId.get(custId);
                if (!current) continue;

                const license = selectSportsCarLicense(licenseMap?.[String(custId)]);
                if (!license) continue;

                current.irating = license.irating ?? current.irating ?? null;
                current.safetyRating = license.safety_rating ?? current.safetyRating ?? null;
            }
        }
    }
}

const CACHE_TTL_MS = 30 * 1000;
let cached: { builtAtMs: number; byCustId: Map<number, DriverAccumulator> } | null = null;

async function buildDriverAccumulatorMap(opts?: { refresh?: boolean }): Promise<Map<number, DriverAccumulator>> {
    const now = Date.now();
    if (cached && !opts?.refresh && now - cached.builtAtMs < CACHE_TTL_MS) return cached.byCustId;

    const byCustId = new Map<number, DriverAccumulator>();
    const seriesUpdatedAt = new Map<string, string | null>();

    const pairs = listSeriesSeasonsFromCatalog();
    for (const pair of pairs) {
        const resolved = await listResolvedEventsSafe(pair);
        const ssKey = `${pair.seriesKey}:${pair.seasonKey}`;

        // Track most recent fetchedAt (DB imports) for this series+season.
        for (const r of resolved) {
            if (r.fetchedAt) {
                seriesUpdatedAt.set(ssKey, maxIso(seriesUpdatedAt.get(ssKey) ?? null, r.fetchedAt));
            }
        }

        for (const r of resolved) {
            const event = getEventById(r.eventId);
            const startIso = r.startTime ?? event?.start ?? null;
            const startMs = parseTimeMs(startIso);
            const track = r.trackName ?? event?.track ?? "Unknown";

            for (const row of r.raceResults.results) {
                if (typeof row?.custId !== "number" || !Number.isFinite(row.custId)) continue;
                const custId = Math.floor(row.custId);
                if (custId <= 0) continue;

                const name = normalizeName(row.name ?? "Unknown Driver");
                const points = typeof row.points === "number" && Number.isFinite(row.points) ? Math.round(row.points) : 0;
                const finishPos =
                    typeof row.finishPosition === "number" && Number.isFinite(row.finishPosition)
                        ? Math.floor(row.finishPosition)
                        : 999999;

                const current = byCustId.get(custId) ?? emptyAcc(custId, name);

                // Prefer the most recent name we see for this custId.
                current.name = name || current.name;
                current.points += points;
                current.starts += 1;
                if (finishPos === 1) current.wins += 1;
                if (finishPos <= 3) current.podiums += 1;
                current.series.add(pair.seriesKey);

                const existingSs =
                    current.seriesSeasons.get(ssKey) ??
                    ({
                        seriesKey: pair.seriesKey,
                        seasonKey: pair.seasonKey,
                        points: 0,
                        starts: 0,
                        wins: 0,
                        podiums: 0,
                        updatedAt: null,
                    } satisfies DriverSeriesSeasonStat);

                existingSs.points += points;
                existingSs.starts += 1;
                if (finishPos === 1) existingSs.wins += 1;
                if (finishPos <= 3) existingSs.podiums += 1;
                current.seriesSeasons.set(ssKey, existingSs);

                if (startMs !== null) {
                    const prev = current.lastRace?.timestamp ?? -Infinity;
                    if (startMs > prev) {
                        current.lastRace = {
                            seriesKey: pair.seriesKey,
                            seriesLabel: seriesLabel(pair.seriesKey),
                            track,
                            dateIso: startIso ?? undefined,
                            timestamp: startMs,
                        };
                    }
                }

                byCustId.set(custId, current);
            }
        }
    }

    // Attach per-series updatedAt.
    for (const acc of byCustId.values()) {
        for (const [key, v] of acc.seriesSeasons.entries()) {
            acc.seriesSeasons.set(key, { ...v, updatedAt: seriesUpdatedAt.get(key) ?? null });
        }
    }

    await applyStaticLicenseFallback(byCustId);

    cached = { builtAtMs: now, byCustId };
    return byCustId;
}

function toStats(acc: DriverAccumulator): DriverStats {
    return {
        iracingCustId: acc.iracingCustId,
        name: acc.name,
        points: Math.round(acc.points),
        starts: acc.starts,
        wins: acc.wins,
        podiums: acc.podiums,
        irating: acc.irating,
        safetyRating: acc.safetyRating,
        series: Array.from(acc.series.values()).sort(),
        lastRace: acc.lastRace
            ? { series: acc.lastRace.seriesLabel, track: acc.lastRace.track, date: acc.lastRace.dateIso }
            : null,
        seriesSeasons: Array.from(acc.seriesSeasons.values()).sort((a, b) => {
            if (a.seriesKey !== b.seriesKey) return a.seriesKey.localeCompare(b.seriesKey);
            return a.seasonKey.localeCompare(b.seasonKey);
        }),
    };
}

export async function listDriverStatsFromResults(opts?: { refresh?: boolean }): Promise<DriverStats[]> {
    const byCustId = await buildDriverAccumulatorMap(opts);
    return Array.from(byCustId.values()).map(toStats);
}

export async function getDriverStatsFromResultsByCustId(
    iracingCustId: number,
    opts?: { refresh?: boolean }
): Promise<DriverStats | null> {
    const byCustId = await buildDriverAccumulatorMap(opts);
    const acc = byCustId.get(iracingCustId);
    return acc ? toStats(acc) : null;
}

