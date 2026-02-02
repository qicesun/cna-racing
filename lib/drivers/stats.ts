import "server-only";

import fs from "fs/promises";
import path from "path";

import { defaultPoints, normalizeName, pointsForPosition } from "@/lib/points";
import {
    getSession,
    type IRacingEventResult,
    type IRacingEventResultFile,
    sortByFinishPosition,
    unwrapIRacingEvent,
} from "@/lib/iracingResult";

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

type DriverAccumulator = {
    iracingCustId: number;
    name: string;
    points: number;
    starts: number;
    irating?: number | null;
    safetyRating?: number | null;
    series: Set<string>; // store series KEYs
    lastRace?: {
        seriesKey: string; // stable
        seriesLabel: string; // display
        track: string;
        dateIso?: string;
        timestamp?: number;
    } | null;
};

export type DriverStats = {
    iracingCustId: number;
    name: string;
    points: number;
    starts: number;
    irating: number | null;
    safetyRating: number | null;
    series: string[];
    lastRace: { series: string; track: string; date?: string } | null;
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

function getBestTimestamp(entry: IndexEntry, event: IRacingEventResult) {
    const startIso = event?.start_time;
    if (startIso) {
        const t = Date.parse(startIso);
        if (Number.isFinite(t)) return { t, iso: startIso };
    }

    const d = entry.date;
    if (d) {
        const t = Date.parse(d);
        if (Number.isFinite(t)) return { t, iso: d };
    }

    return { t: undefined, iso: undefined };
}

const DEFAULT_SOURCES: SeriesSource[] = [
    { key: "gt3open", label: "GT3 Open", indexPath: "/gt3open/results/index.json" },
    { key: "rookie", label: "Rookie", indexPath: "/rookie/results/index.json" },
];

let cachedByCustId: Map<number, DriverAccumulator> | null = null;

async function buildDriverAccumulatorMap(): Promise<Map<number, DriverAccumulator>> {
    if (cachedByCustId) return cachedByCustId;

    const byCustId = new Map<number, DriverAccumulator>();

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

            const trackLabel = entry.track?.trim() || data.track?.track_name || "Unknown";
            const { t: raceTimestamp, iso: raceIso } = getBestTimestamp(entry, data);

            for (const [indexPos, row] of rows.entries()) {
                const custId = typeof row.cust_id === "number" ? row.cust_id : null;
                if (!custId || !Number.isFinite(custId)) continue;

                const name = normalizeName(row.display_name ?? "Unknown Driver");
                const points =
                    typeof row.champ_points === "number" && Number.isFinite(row.champ_points)
                        ? row.champ_points
                        : pointsForPosition(indexPos + 1, defaultPoints);

                const license = selectSportsCarLicense(licenseMap?.[String(custId)]);

                const current =
                    byCustId.get(custId) ??
                    ({
                        iracingCustId: custId,
                        name,
                        points: 0,
                        starts: 0,
                        irating: null,
                        safetyRating: null,
                        series: new Set<string>(),
                        lastRace: null,
                    } satisfies DriverAccumulator);

                // Prefer the most recent name we see for this custId.
                current.name = name || current.name;
                current.points += points;
                current.starts += 1;
                current.series.add(source.key);

                if (license) {
                    current.irating = license.irating ?? current.irating ?? null;
                    current.safetyRating = license.safety_rating ?? current.safetyRating ?? null;
                }

                if (raceTimestamp) {
                    const prev = current.lastRace?.timestamp ?? -Infinity;
                    if (raceTimestamp > prev) {
                        current.lastRace = {
                            seriesKey: source.key,
                            seriesLabel: source.label,
                            track: trackLabel,
                            dateIso: raceIso ?? entry.date ?? data.start_time,
                            timestamp: raceTimestamp,
                        };
                    }
                }

                byCustId.set(custId, current);
            }
        }
    }

    cachedByCustId = byCustId;
    return byCustId;
}

function toStats(acc: DriverAccumulator): DriverStats {
    return {
        iracingCustId: acc.iracingCustId,
        name: acc.name,
        points: Math.round(acc.points),
        starts: acc.starts,
        irating: acc.irating ?? null,
        safetyRating: acc.safetyRating ?? null,
        series: Array.from(acc.series.values()).sort(),
        lastRace: acc.lastRace
            ? { series: acc.lastRace.seriesLabel, track: acc.lastRace.track, date: acc.lastRace.dateIso }
            : null,
    };
}

export async function listDriverStatsFromResults(): Promise<DriverStats[]> {
    const byCustId = await buildDriverAccumulatorMap();
    return Array.from(byCustId.values()).map(toStats);
}

export async function getDriverStatsFromResultsByCustId(iracingCustId: number): Promise<DriverStats | null> {
    const byCustId = await buildDriverAccumulatorMap();
    const acc = byCustId.get(iracingCustId);
    return acc ? toStats(acc) : null;
}

