import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { getEventById, normalizeEventId, parseEventId } from "@/lib/events/catalog";
import { getCnaEventSourceByEventId } from "@/lib/db/cnaEventSources";
import { listCnaEventResultSummariesBySeriesSeason, upsertCnaEventResult } from "@/lib/db/cnaEventResults";
import { upsertCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";
import { unwrapIRacingEvent } from "@/lib/iracingResult";
import { fetchIracingSubsessionResult } from "@/lib/iracing/results";
import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import { computeSeriesStandings } from "@/lib/results/computeSeriesStandings";
import { parseIracingRaceResult } from "@/lib/results/parseEventResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, errorDescription: string, extra?: Record<string, unknown>) {
    return NextResponse.json({ error, error_description: errorDescription, ...(extra ?? {}) }, { status });
}

function isAuthError(e: unknown): { status: number; message: string } | null {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Not authenticated")) return { status: 401, message: "Login required." };
    if (msg.includes("Not authorized")) return { status: 403, message: "Admin only." };
    return null;
}

function toIntOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n)) return Math.trunc(n);
    }
    return null;
}

function normalizeKey(input: string): string {
    return String(input ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function trackMatches(expected: string, actual: string): boolean {
    const e = normalizeKey(expected);
    const a = normalizeKey(actual);
    if (!e || !a) return true; // can't validate reliably
    return e.includes(a) || a.includes(e);
}

const MAX_IMPORT_START_DISTANCE_MS = 36 * 60 * 60 * 1000;

function validateImportedResult(params: {
    eventId: string;
    expectedStartIso: string;
    expectedTrack: string;
    rawJson: unknown;
}): { ok: true; warnings: string[] } | { ok: false; reason: string; details: Record<string, unknown> } {
    const warnings: string[] = [];

    const data: any = unwrapIRacingEvent(params.rawJson);
    if (!data) {
        return {
            ok: false,
            reason: "Invalid iRacing result JSON (missing event data).",
            details: { eventId: params.eventId },
        };
    }

    const expectedLeagueId = toIntOrNull(process.env.CNA_IRACING_LEAGUE_ID ?? "13306");
    const leagueId = toIntOrNull((data as any).league_id);
    if (expectedLeagueId && leagueId && leagueId !== expectedLeagueId) {
        return {
            ok: false,
            reason: "League mismatch (subsession does not belong to CNA league).",
            details: { expectedLeagueId, leagueId, eventId: params.eventId },
        };
    }
    if (expectedLeagueId && !leagueId) warnings.push("Missing league_id in iRacing payload.");

    const expectedStartMs = Date.parse(params.expectedStartIso);
    const actualStartIso = typeof data.start_time === "string" ? data.start_time : null;
    const actualStartMs = actualStartIso ? Date.parse(actualStartIso) : NaN;
    if (Number.isFinite(expectedStartMs) && Number.isFinite(actualStartMs)) {
        const diffMs = Math.abs(expectedStartMs - actualStartMs);
        if (diffMs > MAX_IMPORT_START_DISTANCE_MS) {
            return {
                ok: false,
                reason: "Start time mismatch (subsession start_time is too far from schedule).",
                details: {
                    eventId: params.eventId,
                    expectedStartIso: params.expectedStartIso,
                    actualStartIso,
                    diffHours: Math.round((diffMs / (60 * 60 * 1000)) * 10) / 10,
                },
            };
        }
    } else {
        warnings.push("Missing or invalid start_time in iRacing payload (skipped time validation).");
    }

    const apiTrackName = typeof data.track?.track_name === "string" ? data.track.track_name : null;
    if (apiTrackName) {
        if (!trackMatches(params.expectedTrack, apiTrackName)) {
            return {
                ok: false,
                reason: "Track mismatch (subsession track_name does not match schedule).",
                details: { eventId: params.eventId, expectedTrack: params.expectedTrack, apiTrackName },
            };
        }
    } else {
        warnings.push("Missing track.track_name in iRacing payload (skipped track validation).");
    }

    return { ok: true, warnings };
}

export async function POST(request: NextRequest) {
    let admin;
    try {
        admin = await requireAdminUser();
    } catch (e) {
        const auth = isAuthError(e);
        if (auth) return jsonError(auth.status, "unauthorized", auth.message);
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Unknown error");
    }

    let payload: any = null;
    try {
        payload = await request.json();
    } catch {
        payload = null;
    }

    const eventId = typeof payload?.eventId === "string" ? normalizeEventId(payload.eventId) : null;
    if (!eventId) return jsonError(400, "invalid_request", "Expected { eventId: string }.");

    const force = payload?.force === true;
    const recomputeStandings = payload?.recomputeStandings !== false;

    const event = getEventById(eventId);
    if (!event) return jsonError(404, "not_found", "Event not found in catalog.");

    const parsed = parseEventId(eventId);
    if (!parsed) return jsonError(400, "invalid_request", "Invalid event_id format (expected series:season:round).");

    const source = await getCnaEventSourceByEventId(eventId);
    if (!source) return jsonError(404, "not_found", "Missing event source mapping (subsession_id).");

    const accessToken = await getValidIracingAuthAccessToken(admin.iracingCustId);
    if (!accessToken) {
        return jsonError(
            400,
            "not_connected",
            "Missing iRacing advanced authorization. Go to /account and connect 'iRacing 数据（高级授权）' first."
        );
    }

    const fetchedAt = new Date().toISOString();

    let rawJson: unknown;
    try {
        rawJson = await fetchIracingSubsessionResult({ accessToken, subsessionId: source.subsessionId });
    } catch (e) {
        return jsonError(502, "upstream_error", e instanceof Error ? e.message : "Failed to fetch iRacing results.");
    }

    const validation = validateImportedResult({
        eventId,
        expectedStartIso: event.start,
        expectedTrack: event.track,
        rawJson,
    });
    if (!validation.ok && !force) {
        return jsonError(409, "validation_failed", validation.reason, { details: validation.details });
    }

    let parsedRace;
    try {
        parsedRace = parseIracingRaceResult(rawJson);
    } catch (e) {
        return jsonError(500, "parse_error", e instanceof Error ? e.message : "Failed to parse iRacing results.");
    }

    try {
        await upsertCnaEventResult({
            eventId,
            seriesKey: event.seriesKey,
            subsessionId: source.subsessionId,
            startTime: parsedRace.startTime,
            trackName: parsedRace.trackName,
            rawJson,
            raceResults: parsedRace.raceResults,
            fetchedAt,
        });
    } catch (e) {
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Failed to persist event result.");
    }

    if (!recomputeStandings) {
        return NextResponse.json({
            ok: true,
            imported: {
                eventId,
                subsessionId: source.subsessionId,
                fetchedAt,
                startTime: parsedRace.startTime,
                trackName: parsedRace.trackName,
                count: parsedRace.raceResults.results.length,
            },
            warnings: validation.ok ? validation.warnings : ["Import forced; validations failed."],
        });
    }

    // Recompute standings for the whole season whenever we import a round.
    try {
        const rows = await listCnaEventResultSummariesBySeriesSeason({
            seriesKey: parsed.seriesKey,
            seasonKey: parsed.seasonKey,
        });

        const standings = computeSeriesStandings({
            seriesKey: parsed.seriesKey,
            seasonKey: parsed.seasonKey,
            events: rows.map((r) => ({ eventId: r.eventId, raceResults: r.raceResults })),
            nowIso: fetchedAt,
        });

        await upsertCnaSeriesStandings({
            seriesKey: parsed.seriesKey,
            seasonKey: parsed.seasonKey,
            data: standings,
            updatedAt: fetchedAt,
        });
    } catch (e) {
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Failed to compute standings.");
    }

    return NextResponse.json({
        ok: true,
        imported: {
            eventId,
            subsessionId: source.subsessionId,
            fetchedAt,
            startTime: parsedRace.startTime,
            trackName: parsedRace.trackName,
            count: parsedRace.raceResults.results.length,
        },
        warnings: validation.ok ? validation.warnings : ["Import forced; validations failed."],
    });
}
