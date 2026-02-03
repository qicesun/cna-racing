import { defaultPoints, normalizeName, pointsForPosition } from "@/lib/points";
import {
    getSession,
    type IRacingDriverRow,
    sortByFinishPosition,
    unwrapIRacingEvent,
} from "@/lib/iracingResult";

import type { CnaEventRaceResultsV1, CnaEventRaceResultRowV1 } from "@/lib/results/types";

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const n = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s ? s : null;
}

function finishPos1(row: IRacingDriverRow, fallbackPos1: number): number {
    const pos0 = toNumberOrNull(row.finish_position ?? row.position);
    if (pos0 === null) return fallbackPos1;
    return Math.max(1, Math.floor(pos0) + 1);
}

export type ParsedIracingRaceResult = {
    startTime: string | null;
    trackName: string | null;
    raceResults: CnaEventRaceResultsV1;
};

export function parseIracingRaceResult(rawJson: unknown): ParsedIracingRaceResult {
    const event = unwrapIRacingEvent(rawJson);
    if (!event) throw new Error("Invalid iRacing result JSON (missing event data).");

    const race = getSession(event, "RACE");
    if (!race?.results?.length) throw new Error("iRacing result JSON missing RACE session results.");

    const rows = sortByFinishPosition(race.results);
    const results: CnaEventRaceResultRowV1[] = [];

    for (const [idx, row] of rows.entries()) {
        const custId = toNumberOrNull(row.cust_id);
        if (!custId || !Number.isFinite(custId)) continue;

        const name = normalizeName(row.display_name ?? "Unknown Driver");
        const fp1 = finishPos1(row, idx + 1);

        const champPointsRaw = toNumberOrNull(row.champ_points);
        const champPoints = champPointsRaw !== null ? Math.round(champPointsRaw) : null;
        const points = champPoints ?? pointsForPosition(fp1, defaultPoints);

        results.push({
            custId: Math.floor(custId),
            name,
            finishPosition: fp1,
            points: Math.round(points),
            champPoints,
            carName: toStringOrNull(row.car_name),
            carNumber: toStringOrNull(row.car_number),
            incidents: toNumberOrNull(row.incidents),
            lapsComplete: toNumberOrNull(row.laps_complete),
            reasonOut: toStringOrNull(row.reason_out),
        });
    }

    const trackNameRaw = event.track?.track_name ? String(event.track.track_name) : null;
    const configNameRaw = event.track?.config_name ? String(event.track.config_name) : null;
    const trackName = trackNameRaw && configNameRaw ? `${trackNameRaw} - ${configNameRaw}` : trackNameRaw;

    return {
        startTime: typeof event.start_time === "string" ? event.start_time : null,
        trackName: trackName ? trackName.trim() : null,
        raceResults: { version: 1, results },
    };
}

