import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { getEventById, normalizeEventId } from "@/lib/events/catalog";
import { getCnaEventSourceByEventId, listCnaEventSources, upsertCnaEventSource } from "@/lib/db/cnaEventSources";

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

export async function GET() {
    try {
        await requireAdminUser();
    } catch (e) {
        const auth = isAuthError(e);
        if (auth) return jsonError(auth.status, "unauthorized", auth.message);
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Unknown error");
    }

    try {
        const sources = await listCnaEventSources(2000);
        return NextResponse.json({ ok: true, sources });
    } catch (e) {
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Unknown error");
    }
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
    const subsessionIdRaw = payload?.subsessionId;
    const subsessionId =
        typeof subsessionIdRaw === "number" ? subsessionIdRaw : typeof subsessionIdRaw === "string" ? Number(subsessionIdRaw) : NaN;

    if (!eventId || !Number.isFinite(subsessionId) || !Number.isInteger(subsessionId) || subsessionId <= 0) {
        return jsonError(400, "invalid_request", "Expected { eventId: string, subsessionId: number }.");
    }

    const event = getEventById(eventId);
    if (!event) return jsonError(404, "not_found", "Event not found in catalog.");

    try {
        const existing = await getCnaEventSourceByEventId(eventId);
        await upsertCnaEventSource({
            eventId,
            seriesKey: event.seriesKey,
            subsessionId,
            createdBy: existing?.createdBy ?? admin.iracingCustId,
        });
        return NextResponse.json({ ok: true });
    } catch (e) {
        return jsonError(500, "server_error", e instanceof Error ? e.message : "Unknown error");
    }
}

