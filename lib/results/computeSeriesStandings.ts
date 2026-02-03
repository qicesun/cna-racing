import { parseEventId } from "@/lib/events/catalog";

import type {
    CnaEventRaceResultsV1,
    CnaSeriesStandingsRowV1,
    CnaSeriesStandingsV1,
} from "@/lib/results/types";

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isCnaEventRaceResultsV1(value: unknown): value is CnaEventRaceResultsV1 {
    if (!isObject(value)) return false;
    if (value.version !== 1) return false;
    if (!Array.isArray(value.results)) return false;
    return true;
}

export type SeriesStandingsInputEvent = {
    eventId: string;
    raceResults: unknown;
};

export function computeSeriesStandings(params: {
    seriesKey: string;
    seasonKey: string;
    events: SeriesStandingsInputEvent[];
    nowIso?: string;
}): CnaSeriesStandingsV1 {
    const validEvents = params.events
        .map((e) => {
            const parsed = parseEventId(e.eventId);
            if (!parsed) return null;
            if (parsed.seriesKey !== params.seriesKey) return null;
            if (parsed.seasonKey !== params.seasonKey) return null;
            if (!isCnaEventRaceResultsV1(e.raceResults)) return null;
            return { eventId: e.eventId, round: parsed.round, raceResults: e.raceResults };
        })
        .filter((x): x is { eventId: string; round: number; raceResults: CnaEventRaceResultsV1 } => x !== null)
        .sort((a, b) => a.round - b.round);

    type Acc = CnaSeriesStandingsRowV1 & { name: string };
    const byCustId = new Map<number, Acc>();

    for (const e of validEvents) {
        for (const r of e.raceResults.results) {
            if (typeof r?.custId !== "number" || !Number.isFinite(r.custId)) continue;
            const custId = Math.floor(r.custId);
            if (custId <= 0) continue;

            const points = typeof r.points === "number" && Number.isFinite(r.points) ? Math.round(r.points) : 0;
            const finishPosition =
                typeof r.finishPosition === "number" && Number.isFinite(r.finishPosition) ? Math.floor(r.finishPosition) : 999999;

            const current =
                byCustId.get(custId) ??
                ({
                    custId,
                    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Unknown Driver",
                    points: 0,
                    starts: 0,
                    wins: 0,
                    podiums: 0,
                } satisfies Acc);

            current.name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : current.name;
            current.points += points;
            current.starts += 1;
            if (finishPosition === 1) current.wins += 1;
            if (finishPosition <= 3) current.podiums += 1;

            byCustId.set(custId, current);
        }
    }

    const standings = Array.from(byCustId.values()).sort((a, b) => {
        return (
            b.points - a.points ||
            b.wins - a.wins ||
            b.podiums - a.podiums ||
            b.starts - a.starts ||
            a.name.localeCompare(b.name) ||
            a.custId - b.custId
        );
    });

    return {
        version: 1,
        seriesKey: params.seriesKey,
        seasonKey: params.seasonKey,
        eventIds: validEvents.map((e) => e.eventId),
        standings,
        updatedAt: params.nowIso ?? new Date().toISOString(),
    };
}

