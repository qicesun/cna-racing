import "server-only";

import { listAllEvents } from "@/lib/events/catalog";
import { getCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteInt(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export type DriverCnaSeasonStat = {
    seriesKey: string;
    seasonKey: string;
    name: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    updatedAt: string | null;
};

type CnaSeriesStandingsRowV1 = {
    custId: number;
    name: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
};

type CnaSeriesStandingsV1 = {
    version: 1;
    seriesKey: string;
    seasonKey: string;
    updatedAt?: unknown;
    standings: CnaSeriesStandingsRowV1[];
};

function isCnaSeriesStandingsV1(value: unknown): value is CnaSeriesStandingsV1 {
    if (!isObject(value)) return false;
    if (value.version !== 1) return false;
    if (!Array.isArray(value.standings)) return false;
    return true;
}

function toInt(value: unknown): number {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
    return n;
}

export async function listDriverCnaSeasonStatsFromDb(iracingCustId: number): Promise<DriverCnaSeasonStat[]> {
    // Derive the currently-known series+season pairs from the catalog so we don't hardcode gt3open/rookie here.
    const pairs = new Map<string, { seriesKey: string; seasonKey: string }>();
    for (const e of listAllEvents()) {
        const key = `${e.seriesKey}:${e.seasonKey}`;
        if (!pairs.has(key)) pairs.set(key, { seriesKey: e.seriesKey, seasonKey: e.seasonKey });
    }

    const out: DriverCnaSeasonStat[] = [];

    for (const pair of pairs.values()) {
        const row = await getCnaSeriesStandings(pair).catch(() => null);
        if (!row) continue;

        const data = row.data;
        if (!isCnaSeriesStandingsV1(data)) continue;

        const hit = (data.standings ?? []).find((s: any) => isFiniteInt(s?.custId) && s.custId === iracingCustId);
        if (!hit) continue;

        const name = typeof hit.name === "string" && hit.name.trim() ? hit.name.trim() : "Driver";
        out.push({
            seriesKey: pair.seriesKey,
            seasonKey: pair.seasonKey,
            name,
            points: toInt(hit.points),
            starts: toInt(hit.starts),
            wins: toInt(hit.wins),
            podiums: toInt(hit.podiums),
            updatedAt: typeof (data as any).updatedAt === "string" ? (data as any).updatedAt : row.updatedAt ?? null,
        });
    }

    return out;
}

export function aggregateDriverCnaSeasonStats(stats: DriverCnaSeasonStat[]): {
    name: string | null;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
} {
    if (!stats.length) {
        return { name: null, points: 0, starts: 0, wins: 0, podiums: 0 };
    }

    const acc = { name: stats[0]?.name ?? null, points: 0, starts: 0, wins: 0, podiums: 0 };
    for (const s of stats) {
        acc.name = s.name || acc.name;
        acc.points += toInt(s.points);
        acc.starts += toInt(s.starts);
        acc.wins += toInt(s.wins);
        acc.podiums += toInt(s.podiums);
    }
    return acc;
}

