import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { getEventById, normalizeEventId, parseEventId } from "@/lib/events/catalog";
import { getCnaEventSourceByEventId } from "@/lib/db/cnaEventSources";
import { listCnaEventResultsBySeriesSeason, upsertCnaEventResult } from "@/lib/db/cnaEventResults";
import { upsertCnaSeriesStandings } from "@/lib/db/cnaSeriesStandings";
import { fetchIracingSubsessionResult } from "@/lib/iracing/results";
import { getValidIracingAuthAccessToken } from "@/lib/iracing/tokenStore";
import { computeSeriesStandings } from "@/lib/results/computeSeriesStandings";
import { parseIracingRaceResult } from "@/lib/results/parseEventResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, errorDescription: string) {
    return NextResponse.json({ error, error_description: errorDescription }, { status });
}

function isAuthError(e: unknown): { status: number; message: string } | null {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Not authenticated")) return { status: 401, message: "Login required." };
    if (msg.includes("Not authorized")) return { status: 403, message: "Admin only." };
    return null;
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

    // Recompute standings for the whole season whenever we import a round.
    try {
        const rows = await listCnaEventResultsBySeriesSeason({
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
    });
}

